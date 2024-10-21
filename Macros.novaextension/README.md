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

A nofication will signal recording has begun. A red dot will pulsate in the right part of status bar and all text editing actions are recorded together with things like Find, running commands, inserting snippets etc. When done, you select Stop Recording and can either replay the recorded macro or save it for later use.

When saving a macro, it will appear in the bundle editor as (currently) a read-only macro which can get an activation sequence and scope selector, just like any other bundle item.

It is possible to set whether or not the macro should use a local clipboard while being executed. The local clipboard is generally advantageous (thus the default) but sometimes you may want the macro to affect the “real” clipboard and can disable this option.

### Actions

The following actions are recorded:

- INS (insert text)
- DEL (delete text)
- POS (relative change in cursor position)
- SEL (selected text ranges)

In addition to this, each macro stores its own expanded/unexpanded state in the sidebar.


### Configuration

To configure global preferences, open **Extensions → Extension Library...** then select Macros's **Settings** tab.

- Recording
  - Compress Macro
    - default: on

- Playback
  - Adjust Playback Speed
    - default: off
  - Playback Speed (milliseconds)
    - default: 100
