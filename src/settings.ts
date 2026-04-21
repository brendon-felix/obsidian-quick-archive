import {
	AbstractInputSuggest,
	App,
	PluginSettingTab,
	SearchComponent,
	Setting,
	TAbstractFile,
	TFolder,
} from "obsidian";

export interface QuickArchiveSettings {
	archiveFolder: string;
}

export const DEFAULT_SETTINGS: QuickArchiveSettings = {
	archiveFolder: "",
};

const MAX_FOLDER_SUGGESTIONS = 1000;

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private readonly search: SearchComponent;

	constructor(app: App, search: SearchComponent) {
		super(app, search.inputEl);
		this.search = search;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const query = inputStr.trim().toLowerCase();

		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter(
				(file: TAbstractFile): file is TFolder => file instanceof TFolder,
			);

		if (query.length === 0) {
			return folders.slice(0, MAX_FOLDER_SUGGESTIONS);
		}

		return folders
			.filter((folder) => folder.path.toLowerCase().includes(query))
			.slice(0, MAX_FOLDER_SUGGESTIONS);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.search.setValue(folder.path);
		this.search.inputEl.dispatchEvent(new Event("input"));
		this.close();
	}
}

type QuickArchivePluginLike = {
	settings: QuickArchiveSettings;
	updateArchiveFolder: (rawValue: string) => Promise<void>;
};

export class QuickArchiveSettingTab extends PluginSettingTab {
	plugin: QuickArchivePluginLike;

	constructor(app: App, plugin: QuickArchivePluginLike) {
		super(app, plugin as never);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Archive folder")
			.setDesc("Files are moved to this folder path.")
			.addSearch((search) => {
				new FolderSuggest(this.app, search);
				search
					.setPlaceholder("Archive")
					.setValue(this.plugin.settings.archiveFolder)
					.onChange((value) => {
						void this.plugin.updateArchiveFolder(value);
					});
			});
	}
}
