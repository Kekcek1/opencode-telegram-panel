Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
node = "C:\Program Files\nodejs\node.exe"
shell.CurrentDirectory = root
shell.Run """" & node & """ """ & root & "\bot.mjs""", 0, False
