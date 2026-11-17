# Install wholeloop into one coding client and check the result.
# Render from the repository root, with the released wl on PATH:
#   vhs docs/assets/terminal/install.tape
# Everything is written under a new temporary home, never your own.
Output docs/assets/terminal/install.gif

Require wl
Set Shell bash
Set FontSize 15
Set Width 1400
Set Height 520
Set Padding 24
Set TypingSpeed 30ms
Set Theme "Dracula"

Hide
Type "export HOME=$(mktemp -d /tmp/wholeloop-demo.XXXX) TMPDIR=/tmp PS1='$ ' && export XDG_STATE_HOME=$HOME/.local/state XDG_CONFIG_HOME=$HOME/.config && cd $HOME && clear"
Enter
Sleep 500ms
Show

Type "wl --version"
Sleep 300ms
Enter
Sleep 1s

Type "wl install --target claude --scope user --dry-run"
Sleep 400ms
Enter
Sleep 2s

Type "wl install --target claude --scope user"
Sleep 400ms
Enter
Sleep 3s

Type "clear && wl doctor --target claude"
Sleep 400ms
Enter
Sleep 5s
