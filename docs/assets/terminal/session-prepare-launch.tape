# Illustrative example session for the prepare-launch documentation page.
# It replays sessions/prepare-launch.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-prepare-launch.tape
Output docs/assets/terminal/session-prepare-launch.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 566
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/prepare-launch.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:prepare-launch scope-a9e0`
Sleep 400ms
Enter
Sleep 9s
