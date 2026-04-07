# Nav Unification Progress

Shared nav CSS: `/shared/nav.css`
Standard nav HTML: `<nav class="dev-nav">` with 4 links (Game | Editors | Settings | Gameplan)

## Completed

- [x] sound/index.html — replaced inline `.dev-nav` CSS block with `<link rel="stylesheet" href="/shared/nav.css">`
- [x] hud-editor/index.html — replaced `.nav` class with `.dev-nav` via shared CSS link; updated nav HTML to standard 4-link pattern; removed HUD Layout from main nav (sub-tool of editors)
- [x] Deleted dead shader pipeline files (no imports found anywhere):
  - src/graphics/AlienTonePipeline.js
  - src/graphics/ScanlinePipeline.js
  - src/graphics/TiltShiftPipeline.js
  - src/graphics/DoorRipplePipeline.js

## Notes

- GameScene.js references `this.alienTonePipeline` as a property name but never imports the class file — safe to delete
- No JS files were modified during the nav-unification task itself, so no additional `node --check` was needed for that change set
