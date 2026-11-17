# Illustrative example session for the cut-scopes documentation page.
# It replays sessions/cut-scopes.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-cut-scopes.tape
Output docs/assets/terminal/session-cut-scopes.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 588
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/cut-scopes.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:cut-scopes init-41c2`
Sleep 400ms
Enter
Sleep 8s
