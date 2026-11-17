# Illustrative example session for the research documentation page.
# It replays sessions/research.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-research.tape
Output docs/assets/terminal/session-research.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 808
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/research.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:research Do users struggle to find their past orders, and how do comparable products solve it?`
Sleep 400ms
Enter
Sleep 10s
