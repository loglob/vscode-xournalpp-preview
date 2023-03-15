import * as vscode from 'vscode';
import { XoppEditorProvider } from "./xoppEditor"

export function activate(context: vscode.ExtensionContext)
{
	context.subscriptions.push(vscode.window.registerCustomEditorProvider(
		XoppEditorProvider.viewType,
		new XoppEditorProvider(context),
		{
			supportsMultipleEditorsPerDocument: true
		}
	));
}

// This method is called when your extension is deactivated
export function deactivate() {}
