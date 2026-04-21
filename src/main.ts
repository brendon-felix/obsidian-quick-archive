import { Notice, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";
import {
	DEFAULT_SETTINGS,
	QuickArchiveSettings,
	QuickArchiveSettingTab,
} from "./settings";

type SortFn = (a: TFile, b: TFile) => number;

type ExplorerSortOrder =
	| "alphabetical"
	| "alphabeticalReverse"
	| "byCreatedTime"
	| "byCreatedTimeReverse"
	| "byModifiedTime"
	| "byModifiedTimeReverse";

const sanitizeFolderPath = (value: string): string => {
	return value.trim().replace(/^\/+|\/+$/g, "");
};

const isFile = (item: TAbstractFile): item is TFile => item instanceof TFile;

const isExplorerSortOrder = (value: unknown): value is ExplorerSortOrder => {
	return (
		value === "alphabetical" ||
		value === "alphabeticalReverse" ||
		value === "byCreatedTime" ||
		value === "byCreatedTimeReverse" ||
		value === "byModifiedTime" ||
		value === "byModifiedTimeReverse"
	);
};

const localeSorter: SortFn = (a: TFile, b: TFile) =>
	a.basename.localeCompare(b.basename, undefined, {
		numeric: true,
		sensitivity: "base",
	});

const localeSorterReverse: SortFn = (a: TFile, b: TFile) =>
	b.basename.localeCompare(a.basename, undefined, {
		numeric: true,
		sensitivity: "base",
	});

const ctimeSorter: SortFn = (a: TFile, b: TFile) => b.stat.ctime - a.stat.ctime;
const ctimeSorterReverse: SortFn = (a: TFile, b: TFile) =>
	a.stat.ctime - b.stat.ctime;
const mtimeSorter: SortFn = (a: TFile, b: TFile) => b.stat.mtime - a.stat.mtime;
const mtimeSorterReverse: SortFn = (a: TFile, b: TFile) =>
	a.stat.mtime - b.stat.mtime;

const SORTERS: Record<ExplorerSortOrder, SortFn> = {
	alphabetical: localeSorter,
	alphabeticalReverse: localeSorterReverse,
	byCreatedTime: ctimeSorter,
	byCreatedTimeReverse: ctimeSorterReverse,
	byModifiedTime: mtimeSorter,
	byModifiedTimeReverse: mtimeSorterReverse,
};

export default class QuickArchivePlugin extends Plugin {
	settings: QuickArchiveSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "archive-active-file",
			name: "Archive active file",
			callback: () => {
				void this.archiveActiveFile();
			},
		});

		this.addSettingTab(new QuickArchiveSettingTab(this.app, this));
	}

	async updateArchiveFolder(rawValue: string): Promise<void> {
		this.settings.archiveFolder = sanitizeFolderPath(rawValue);
		await this.saveSettings();
	}

	private readExplorerSortOrder(): ExplorerSortOrder {
		const explorerLeaf =
			this.app.workspace.getLeavesOfType("file-explorer")[0];
		if (explorerLeaf === undefined) {
			return "alphabetical";
		}

		const state = explorerLeaf.getViewState().state;
		if (typeof state !== "object" || state === null) {
			return "alphabetical";
		}

		const sortOrder = (state as { sortOrder?: unknown }).sortOrder;
		if (isExplorerSortOrder(sortOrder)) {
			return sortOrder;
		}

		return "alphabetical";
	}

	private getNextFileInFolder(
		folder: TFolder,
		currentFile: TFile,
	): TFile | null {
		const sortOrder = this.readExplorerSortOrder();
		const sortFn = SORTERS[sortOrder] ?? localeSorter;

		const files = folder.children.filter(isFile).sort(sortFn);
		if (files.length <= 1) {
			return null;
		}

		const currentIndex = files.findIndex(
			(file) => file.path === currentFile.path,
		);
		if (currentIndex === -1) {
			return files[0] ?? null;
		}

		const nextIndex = (currentIndex + 1) % files.length;
		const nextFile = files[nextIndex];

		if (nextFile === undefined || nextFile.path === currentFile.path) {
			return null;
		}

		return nextFile;
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const segments = folderPath
			.split("/")
			.filter((segment) => segment.length > 0);

		let currentPath = "";
		for (const segment of segments) {
			currentPath =
				currentPath.length > 0 ? `${currentPath}/${segment}` : segment;

			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (existing instanceof TFolder) {
				continue;
			}

			if (existing !== null) {
				throw new Error(
					`Path exists and is not a folder: ${currentPath}`,
				);
			}

			await this.app.vault.createFolder(currentPath);
		}
	}

	private async archiveActiveFile(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile === null) {
			new Notice("No active file to archive.");
			return;
		}

		const targetFolderPath = sanitizeFolderPath(
			this.settings.archiveFolder,
		);
		if (targetFolderPath.length === 0) {
			new Notice("Set an archive folder in plugin settings first.");
			return;
		}

		const sourceFolder = activeFile.parent ?? this.app.vault.getRoot();
		if (sourceFolder.path === targetFolderPath) {
			new Notice("Archive folder matches the current folder.");
			return;
		}

		const nextFile = this.getNextFileInFolder(sourceFolder, activeFile);

		try {
			await this.ensureFolderExists(targetFolderPath);
		} catch (error: unknown) {
			new Notice(`Could not create archive folder: ${String(error)}`);
			return;
		}

		const destinationPath = `${targetFolderPath}/${activeFile.name}`;

		try {
			await this.app.fileManager.renameFile(activeFile, destinationPath);
		} catch (error: unknown) {
			new Notice(`Could not archive file: ${String(error)}`);
			return;
		}

		if (nextFile !== null) {
			const leaf = this.app.workspace.getMostRecentLeaf();
			if (leaf !== null) {
				await leaf.openFile(nextFile);
			}
		}
	}

	private async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		this.settings = this.parseSettings(data);
	}

	private parseSettings(data: unknown): QuickArchiveSettings {
		if (typeof data !== "object" || data === null) {
			return { ...DEFAULT_SETTINGS };
		}

		const modern = (data as { archiveFolder?: unknown }).archiveFolder;
		if (typeof modern === "string") {
			return { archiveFolder: sanitizeFolderPath(modern) };
		}

		const legacy = (data as { archive_folder?: unknown }).archive_folder;
		if (typeof legacy === "string") {
			return { archiveFolder: sanitizeFolderPath(legacy) };
		}

		return { ...DEFAULT_SETTINGS };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
