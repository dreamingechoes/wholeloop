# Illustrative example session for the build-slice documentation page.
# It replays sessions/build-slice.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-build-slice.tape
Output docs/assets/terminal/session-build-slice.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 632
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/build-slice.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:build-slice "add CSV export to the orders list"`
Sleep 400ms
Enter
Sleep 10s
