import { CancellationToken, CustomDocument, CustomDocumentOpenContext,
		CustomReadonlyEditorProvider, ExtensionContext, Uri,
		WebviewPanel, window, workspace } from 'vscode';
import * as path from "path";
import * as cp from "child_process"
import * as fs from 'fs/promises';

class XoppDocument implements CustomDocument
{
	public readonly uri: Uri;
	public readonly pageDir : string;

	dispose(): void
	{
		fs.rm(this.pageDir, { recursive: true })
	}

	constructor(uri : Uri, pageDir : string)
	{
		this.uri = uri;
		this.pageDir = pageDir;
	}
}

export class XoppEditorProvider implements CustomReadonlyEditorProvider<XoppDocument>
{
	readonly context : ExtensionContext;

	public constructor(ctx : ExtensionContext)
	{
		this.context = ctx;
	}

	async openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext,
		_token: CancellationToken): Promise<XoppDocument>
	{
		const cacheDir = path.join(this.context.extensionPath, "cache");
		await fs.mkdir(cacheDir, { recursive: true });
		const pageLoc = await fs.mkdtemp(cacheDir + path.sep);

		if(typeof openContext.backupId === "string")
			uri = Uri.parse(openContext.backupId);

		var tmpFile = false;

		var file;
		if(uri.scheme !== "file")
		{
			tmpFile = true;
			file = path.join(cacheDir, "temp.xopp");
			await workspace.fs.copy(uri, Uri.file(file));
		}
		else
			file = uri.fsPath;

		// no nice promise wrappers??
		var proc = cp.spawnSync("xournalpp", [ file, "-i", pageLoc + "/page.png" ]);

		if(proc.status != 0)
			throw new Error("Invoking xournalpp failed: " + proc.error?.message);

		if(tmpFile)
			await fs.rm(file);

		return new XoppDocument(uri, pageLoc);
	}

	async resolveCustomEditor(document: XoppDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void>
	{
		var pages = (await fs.readdir(document.pageDir))
			.map(f => webviewPanel.webview.asWebviewUri(
				Uri.joinPath(this.context.extensionUri, "cache", path.basename(document.pageDir), f)
			))
			.map(f => `<img src="${f}">`)
			.join("<br/>");

			// Default localResourceRoots prevents loading from cache, despite listing the extension path.
		webviewPanel.webview.options = {
			enableScripts: true
		}

		webviewPanel.webview.html = `<!DOCTYPE html><html lang="en"><head>
			<meta charset="UTF-8">
			<style>
				img:
				{
					max-width: none;
					max-height: none;
					width: 100%;
				}
			</style>
			<script>
				const maxZoom = 3.0;
				const minZoom = 0.2;
				const magnify = .5;
				const minimize = .1;
				var zoomLevel = 1.0;

				document.addEventListener("wheel", evnt => {
					if(evnt.ctrlKey)
					{
						const zoomStep = zoomLevel > 1.0 ? magnify
							: zoomLevel < 1.0 ? minimize
								: evnt.deltaY < 0 ? magnify : minimize;

						zoomLevel -= Math.sign(evnt.deltaY) * zoomStep;
						zoomLevel = Math.max(minZoom, Math.min(maxZoom, zoomLevel))
						// zoom by changing container width, the actual zoom property behaves weird
						document.getElementById("pages").style.width = \`\${zoomLevel * 100}%\`;

						return false;
					}
				})
			</script>
		</head><body><div id="pages">`
			+ pages
			+ '</div></body></html>';
	}

	public static readonly viewType = "xournalpp-preview.editor"
}