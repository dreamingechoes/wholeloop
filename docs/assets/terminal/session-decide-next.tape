# Illustrative example session for the decide-next documentation page.
# It replays sessions/decide-next.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-decide-next.tape
Output docs/assets/terminal/session-decide-next.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 544
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/decide-next.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:decide-next scope-a9e0`
Sleep 400ms
Enter
Sleep 8s
