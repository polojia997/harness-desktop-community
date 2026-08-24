param(
  [Parameter(Mandatory = $true)]
  [int]$ProcessId,

  [Parameter(Mandatory = $true)]
  [string]$FolderPath
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeDialogAutomation {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr dialog, int itemId);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(
        IntPtr window,
        uint message,
        IntPtr wParam,
        IntPtr lParam
    );
}
"@

$dialog = [IntPtr]::Zero
for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    $process.Refresh()
    $dialog = $process.MainWindowHandle
    if ($dialog -ne [IntPtr]::Zero) {
      break
    }
  } catch {
    # The worker may still be creating its first native window.
  }
  Start-Sleep -Milliseconds 100
}

if ($dialog -eq [IntPtr]::Zero) {
  throw "Folder dialog was not found for process $ProcessId"
}

[NativeDialogAutomation]::SetForegroundWindow($dialog) | Out-Null
Start-Sleep -Milliseconds 250

$escapedPath = $FolderPath.Replace("{", "{{}").Replace("}", "{}}")
$escapedPath = $escapedPath.Replace("+", "{+}").Replace("^", "{^}")
$escapedPath = $escapedPath.Replace("%", "{%}").Replace("~", "{~}")
$escapedPath = $escapedPath.Replace("(", "{(}").Replace(")", "{)}")

[System.Windows.Forms.SendKeys]::SendWait("%d")
Start-Sleep -Milliseconds 150
[System.Windows.Forms.SendKeys]::SendWait($escapedPath)
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Milliseconds 800

$okButton = [NativeDialogAutomation]::GetDlgItem($dialog, 1)
if ($okButton -eq [IntPtr]::Zero) {
  throw "Folder dialog confirmation button was not found."
}

[NativeDialogAutomation]::SendMessage(
  $okButton,
  0x00F5,
  [IntPtr]::Zero,
  [IntPtr]::Zero
) | Out-Null
