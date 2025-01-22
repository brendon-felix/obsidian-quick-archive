import {
	App,
	Editor,
	MarkdownView,
	SuggestModal,
	TFile,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	Vault,
	TAbstractFile,
	Notice,
} from "obsidian";

import { FolderSuggest } from "./FolderSuggestor";

export type SortFn = (a: TFile, b: TFile) => number;

interface FileChuckerPluginSettings {
	archive_folder: string,
}

const DEFAULT_SETTINGS: FileChuckerPluginSettings = {
	archive_folder: "",
};

export default class FileChuckerPlugin extends Plugin {
	settings: FileChuckerPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "chuck-file",
			name: "Chuck File",
			checkCallback: (checking) => {
				// if (checking) {
				// 	// make sure the active view is a MarkdownView.
				// 	return !!this.app.workspace.getActiveViewOfType(
				// 		MarkdownView
				// 	);
				// }
				// let view = this.app.workspace.getActiveViewOfType(MarkdownView);
				// if (!view || !(view instanceof MarkdownView)) return;
				const settings = this.app.workspace.getLeavesOfType('file-explorer')[0].view;
				console.log(`${settings}`);
				const currentFile = this.app.workspace.getActiveFile();
				if (currentFile) {
					const originalFolder = currentFile?.parent ?? this.app.vault.getRoot();
					const specifiedFolderPath = this.settings.archive_folder;
					if (specifiedFolderPath != originalFolder.path) {(async () => {
				
						const isAFile = (thing: TAbstractFile): thing is TFile => {
							return thing instanceof TFile;
						};
						const sortFn: SortFn = (a: TFile, b: TFile) =>
							a.basename.localeCompare(
								b.basename,
								undefined,
								{ numeric: true, sensitivity: 'base' }
							);;
						const files: TFile[] = originalFolder.children.filter(isAFile).sort(sortFn);
						const currentItem = files.findIndex((item) => item.name === currentFile.name);
						const targetFolder = this.app.vault.getAbstractFileByPath(specifiedFolderPath);
						if (targetFolder === null) {
							// console.log(
							// 	`${specifiedFolderPath} does not exist. Creating now...`
							// );
							await this.app.vault.createFolder(specifiedFolderPath);
						}
						const newFilePath =
							specifiedFolderPath + "/" + currentFile.name;
						const toFile = files[(currentItem + 1) % files.length]
						const newLeaf = this.app.workspace.getLeaf();
						await newLeaf.openFile(toFile as TFile);
						// console.log(
						// 	`Moving ${currentFile.path} to ${newFilePath}`
						// );
						await this.app.fileManager.renameFile(currentFile, newFilePath);
					})()};
				}
			},
		});

		this.addSettingTab(new FileChuckerSettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class FileChuckerSettingsTab extends PluginSettingTab {
	plugin: FileChuckerPlugin;

	constructor(app: App, plugin: FileChuckerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Options for File Chucker",
		});

		new Setting(this.containerEl)
            .setName("Archive folder location")
            .setDesc("Files will be placed in this folder.")
            .addSearch((cb) => {
                new FolderSuggest(this.app, cb.inputEl);
                cb.setPlaceholder("Example: folder1/folder2")
                    .setValue(this.plugin.settings.archive_folder)
                    .onChange((new_folder) => {
                        this.plugin.settings.archive_folder = new_folder;
                        this.plugin.saveSettings();
                    });
                // @ts-ignore
                cb.containerEl.addClass("templater_search");
            });
	}
}
