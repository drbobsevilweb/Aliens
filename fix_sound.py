import re

with open("sound/index.html", "r") as f:
    text = f.read()

# First we need to restore the messy JS injections.
# There were 3 blocks of trim variables injected per card because it matched three fxState configs... wait, no, the regex was:
# r'(fxState\.set\(path, \{ \.\.\.\(fxState\.get\(path\) \|\| \{\}\), echoFeedback: parseFloat\(e\.target\.value\) \|\| 0 \}\);\n\s*\}\);)'
# Ah! echoFeedback is uniquely 1 per card. But it may have caught it multiple times across different tests?
# Let's completely wipe it and start fresh with an intuitive UI block.
