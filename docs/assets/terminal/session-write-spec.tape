# Illustrative example session for the write-spec documentation page.
# It replays sessions/write-spec.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-write-spec.tape
Output docs/assets/terminal/session-write-spec.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 610
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/write-spec.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:write-spec init-41c2`
Sleep 400ms
Enter
Sleep 9s
