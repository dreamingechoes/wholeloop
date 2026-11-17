# Illustrative example session for the review-code documentation page.
# It replays sessions/review-code.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-review-code.tape
Output docs/assets/terminal/session-review-code.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 544
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/review-code.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:review-code #142`
Sleep 400ms
Enter
Sleep 9s
