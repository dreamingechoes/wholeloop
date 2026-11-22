# The core without a model: a missing fact becomes a question, and the work is stored.
# Render from the repository root, with wl and git on PATH:
#   vhs docs/assets/terminal/core-tour.tape
# Everything is written under a new temporary home, never your own.
Output docs/assets/terminal/core-tour.gif

Require wl
Require git
Set Shell bash
Set FontSize 15
Set Width 1400
Set Height 420
Set Padding 24
Set TypingSpeed 30ms
Set Theme "Dracula"

Hide
Type "export HOME=$(mktemp -d /tmp/wholeloop-demo.XXXX) TMPDIR=/tmp PS1='$ ' && export XDG_STATE_HOME=$HOME/.local/state XDG_CONFIG_HOME=$HOME/.config && git init -q -b main $HOME/app && cd $HOME/app && wl setup --profile pair --docs local-docs --tracker local-tracker --scope user --json > /dev/null && clear"
Enter
Sleep 1s
Show

Type "wl status"
Sleep 300ms
Enter
Sleep 1500ms

Type "wl next 'Find tasks by title'"
Sleep 400ms
Enter
Sleep 2s

Type "wl next 'Find tasks by title' --owner 'Demo Owner'"
Sleep 400ms
Enter
Sleep 3s

Type "wl status"
Sleep 300ms
Enter
Sleep 4s
