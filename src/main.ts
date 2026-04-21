import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";

interface QuickArchiveSettings {
	archiveFolder: string;
}

const DEFAULT_SETTINGS: QuickArchiveSettings = {
	archiveFolder: "",
};

const sanitizeFolderPath = (value: string): string => {
	return value.trim().replace(/^\/+|\/+$/g, "");
};

const isFile = (item: TAbstractFile): item is TFile => item instanceof TFile;

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

	private getNextFileInFolder(
		folder: TFolder,
		currentFile: TFile,
	): TFile | null {
		const siblings = folder.children
			.filter(
				(item): item is TFile =>
					isFile(item) && item.path !== currentFile.path,
			)
			.sort((a, b) =>
				a.basename.localeCompare(b.basename, undefined, {
					numeric: true,
					sensitivity: "base",
				}),
			);

		return siblings[0] ?? null;
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
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(nextFile);
		}
	}

	private async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		this.settings = this.parseSettings(data);
	}

	private parseSettings(data: unknown): QuickArchiveSettings {
		if (
			typeof data === "object" &&
			data !== null &&
			"archiveFolder" in data &&
			typeof (data as { archiveFolder: unknown }).archiveFolder ===
				"string"
		) {
			return {
				archiveFolder: sanitizeFolderPath(
					(data as { archiveFolder: string }).archiveFolder,
				),
			};
		}

		return { ...DEFAULT_SETTINGS };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class QuickArchiveSettingTab extends PluginSettingTab {
	plugin: QuickArchivePlugin;

	constructor(app: App, plugin: QuickArchivePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Archive folder")
			.setDesc("Files are moved to this folder path.")
			.addText((text) => {
				text.setPlaceholder("Archive")
					.setValue(this.plugin.settings.archiveFolder)
					.onChange((value) => {
						void this.plugin.updateArchiveFolder(value);
					});
			});
	}
}
