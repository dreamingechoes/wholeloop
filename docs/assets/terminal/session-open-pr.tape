# Illustrative example session for the open-pr documentation page.
# It replays sessions/open-pr.txt, the example session printed on that page;
# it is not a recorded run, and the recording says so. Render from the
# repository root:
#   vhs docs/assets/terminal/session-open-pr.tape
Output docs/assets/terminal/session-open-pr.gif

Require bash
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 676
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Dracula"

Hide
Type "export PS1='$ ' && clear && bash docs/assets/terminal/replay.sh docs/assets/terminal/sessions/open-pr.txt"
Enter
Sleep 500ms
Show

Sleep 800ms
Type `/wholeloop:open-pr slice-0d4e`
Sleep 400ms
Enter
Sleep 10s
