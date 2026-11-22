# Illustrative example session for the frame-problem documentation page.
# It replays sessions/frame-problem.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-frame-problem.tape
Output docs/assets/terminal/session-frame-problem.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 550
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/frame-problem.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:frame-problem --from brief-7f3a`
Sleep 400ms
Enter
Sleep 8s
