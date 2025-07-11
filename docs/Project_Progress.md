# FoldVR – Project Progress Mind-Map

_Last updated: 2025-07-11 10:59 (UTC+3)_

## 1. Vision
Create an immersive, performant WebXR molecular viewer with intuitive, wrist-anchored UI on Oculus Quest 3.

---

## 2. Completed Milestones
- **Wrist-anchored radial menu**
  - Anchored to left controller grip.
  - Fade-in/out animation & visibility toggle.
  - Menu always within comfortable reach.
- **Thumb-stick navigation**
  - Left stick highlights wedges by direction.
  - Reduces reliance on ray-casting.
- **Spin removal & size tweak**
  - Disabled automatic menu facing to stop disorienting spin.
  - Scaled menu to 80 % for less screen real-estate.
- **Smooth representation transition**
  - Visual style switch uses scale fades.

---

## 3. Current Focus (Sprint 1)
- [ ] Validate latest build compiles & runs on headset.
- [ ] UX feel test: confirm new menu scale & static orientation are comfortable.
- [ ] Collect feedback & tweak constants (scale, offset, yaw billboarding vs. static).

---

## 4. Upcoming Phases
| Phase | Goal | Target Date |
|-------|------|-------------|
| 1 | **Context-sensitive radial menu**  | ☐ design  |  ☐ impl  |
| 2 | **Quick-load panel polish** – recents bar, scrolling |  |
| 3 | **Flat settings panel** / toggle between radial & panel |  |
| 4 | **Haptics & polish** – adjustable menu distance, pinning |  |

---

## 5. Backlog / Technical Debt
- Re-enable _yaw-only_ billboarding if static menu proves awkward.
- TypeScript lints to review periodically (keep zero-error baseline).
- Add tests or CI check for duplicate code blocks.

---

## 6. Notes & Links
- Source: `src/ui/RadialMenu.ts`, `src/scenes/ConfinedSpaceXR.ts`
- To change menu size: `ConfinedSpaceXR.init → this.menu.object3d.scale.setScalar(…)`.
- Context menu hook will live in right-controller trigger handler.

---

**Legend**: ☐ Todo   ✓ Done
