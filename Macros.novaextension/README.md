**Macros** provides recording and playback of editor changes.

Useful to speed up repetitive edits, to play back text changes for the purposes of screen recordings.

## Usage

To run Macros:

- Select the **Editor → Macros** menu item; or
- Open the command palette and type `Macros`

## Commands

These can be summoned from the Editor meny, Command Palette, or by shortcut key:

- Toggle Macro Recording (`Option`+`Cmd`+`m`)
- Replay Last Macro (`Shift`+`Cmd`+`m`)

## Sidebar

- `>` Play selection (or double-click)
- `+` Start/Stop Recording Macro
- `-` Delete selection

### Context Menu

- Replay
- Compress
- Duplicate
- Rename
- Copy (to Clipboard)
- Delete

## Recording

A nofication will signal recording has begun. When done, you select Stop and the macro will be automatically saved to the sidebar. You can then replay, compress, delete, etc. the recorded macro.

### Actions

The following actions are recorded:

- INS (insert text)
- DEL (delete text)
- POS (relative change in cursor position)
- SEL (selected text ranges)

In addition to this, each macro stores its own expanded/unexpanded state for the sidebar.


### Configuration

To configure global preferences, open **Extensions → Extension Library...** then select Macros's **Settings** tab.

- Recording
  - Compress Macro
    - default: off

- Playback
  - Adjust Playback Speed
    - default: off
  - Playback Speed (milliseconds)
    - default: 100
