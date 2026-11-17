# Illustrative example session for the measure-impact documentation page.
# It replays sessions/measure-impact.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-measure-impact.tape
Output docs/assets/terminal/session-measure-impact.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 522
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/measure-impact.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:measure-impact scope-a9e0 --checkpoint d30`
Sleep 400ms
Enter
Sleep 8s
