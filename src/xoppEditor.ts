import { CancellationToken, CustomDocument, CustomDocumentOpenContext,
		CustomReadonlyEditorProvider, ExtensionContext, Uri, WebviewPanel } from 'vscode';
import * as path from "path";
import * as cp from "child_process"
import { mkdtemp, mkdir, readdir, rm } from 'fs/promises';

class XoppDocument implements CustomDocument
{
	public readonly uri: Uri;
	public readonly pageDir : string;

	dispose(): void
	{
		rm(this.pageDir, { recursive: true })
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
		var cacheDir = path.join(this.context.extensionPath, "cache");
		await mkdir(cacheDir, { recursive: true });

		openContext.backupId

		var pageLoc = await mkdtemp(cacheDir + path.sep);
		var file = typeof openContext.backupId === "string"
			? Uri.parse(openContext.backupId).fsPath
			: uri.fsPath;

		// no nice promise wrappers??
		var proc = cp.spawnSync("xournalpp", [ file, "-i", pageLoc + "/page.png" ]);

		if(proc.status != 0)
			throw new Error("Invoking xournalpp failed: " + proc.error?.message);

		return new XoppDocument(uri, pageLoc);
	}

	async resolveCustomEditor(document: XoppDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void>
	{
		var pages = (await readdir(document.pageDir))
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