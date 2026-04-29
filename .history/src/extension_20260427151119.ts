import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const provider = new HamsterViewProvider(context);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(HamsterViewProvider.viewType, provider));

  const tracker = new TypingSpeedTracker();

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.scheme !== 'file' && event.document.uri.scheme !== 'untitled') {
        return;
      }
      const added = event.contentChanges.reduce((sum, c) => sum + Math.max(0, c.text.length - c.rangeLength), 0);
      if (added > 0) {
        tracker.record(added);
      }
    }),
  );

  const interval = setInterval(() => {
    provider.updateSpeed(tracker.cps());
  }, 200);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() {}

class TypingSpeedTracker {
  private timestamps: number[] = [];

  private get windowMs(): number {
    return vscode.workspace.getConfiguration('hamsterRun').get<number>('windowMs', 2000);
  }

  record(charCount: number) {
    const now = Date.now();
    for (let i = 0; i < charCount; i++) {
      this.timestamps.push(now);
    }
    this.prune(now);
  }

  cps(): number {
    const now = Date.now();
    this.prune(now);
    return this.timestamps.length / (this.windowMs / 1000);
  }

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }
}

class HamsterViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hamsterRun.view';
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  updateSpeed(cps: number) {
    const idleThreshold = vscode.workspace.getConfiguration('hamsterRun').get<number>('idleThreshold', 0.2);
    this.view?.webview.postMessage({ type: 'speed', cps, idleThreshold });
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaUri = (p: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', p)).toString();

    const runFrames = [1, 2, 3, 4].map((n) => mediaUri(`hamster/run-${n}.png`));
    const idleFrames = [1, 2, 3].map((n) => mediaUri(`hamster/idle-${n}.png`));
    const eatFrame = mediaUri('hamster/eat.png');
    const heartImage = mediaUri('heart.png');
    const styleUri = mediaUri('main.css');
    const scriptUri = mediaUri('main.js');
    const nonce = getNonce();

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Run Hamster Run</title>
</head>
<body>
  <div class="stage">
    <img id="hamster" src="${idleFrames[0]}" alt="hamster" />
    <div id="seed" class="seed" hidden></div>
    <div id="speed">0.0 cps</div>
  </div>
  <script nonce="${nonce}">
    window.HAMSTER_FRAMES = {
      run: ${JSON.stringify(runFrames)},
      idle: ${JSON.stringify(idleFrames)},
      eat: ${JSON.stringify(eatFrame)},
      heart: ${JSON.stringify(heartImage)}
    };
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
