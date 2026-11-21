# Find a command: the grouped help, one command's help and a typo suggestion.
# Render from the repository root, with the released wl on PATH:
#   vhs docs/assets/terminal/help.tape
Output docs/assets/terminal/help.gif

Require wl
Set Shell bash
Set FontSize 15
Set Width 1400
Set Height 1100
Set Padding 24
Set TypingSpeed 30ms
Set Theme "Dracula"

Hide
Type "export HOME=$(mktemp -d /tmp/wholeloop-demo.XXXX) TMPDIR=/tmp PS1='$ ' && cd $HOME && clear"
Enter
Sleep 500ms
Show

Type "wl --help"
Sleep 300ms
Enter
Sleep 5s

Type "clear && wl status --help"
Sleep 300ms
Enter
Sleep 3s

Type "wl stauts"
Sleep 300ms
Enter
Sleep 3s
