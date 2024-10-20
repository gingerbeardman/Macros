let slowPlaybackEnabled = nova.config.get('com.gingerbeardman.macros.slowPlayback') || false;
let slowPlaybackSpeed = nova.config.get('com.gingerbeardman.macros.slowPlaybackSpeed') || 0;

var macros = [];
var isRecording = false;
var currentMacro = [];
var macrosView;
var lastCursorPosition = null;
var initialCursorPosition = null;
var lastSelection = null;

class MacrosDataProvider {
    getChildren(element) {
        if (!element) {
            // Root level: return macro names
            return macros.map(m => m.name);
        } else {
            // Macro level: return actions
            let macro = macros.find(m => m.name === element);
            if (macro) {
                return macro.actions.map((action, index) => ({
                    ...action,
                    index: index,
                    macroName: macro.name
                }));
            }
        }
        return [];
    }

    getTreeItem(element) {
        if (typeof element === 'string') {
            // This is a macro name
            let macro = macros.find(m => m.name === element);
            if (!macro) {
                console.error("Macro not found for name:", element);
                return null;
            }

            let item = new TreeItem(element, TreeItemCollapsibleState.Collapsed);
            item.command = "com.gingerbeardman.macros.replayMacro";
            item.contextValue = "macro";
            item.tooltip = `${element} (${macro.actions.length} actions)`;
            item.descriptiveText = `＝ ${macro.actions.length} actions`;
            item.image = "sidebar-list-item";
            item.collapsibleState = TreeItemCollapsibleState.Expanded;

            return item;
        } else {
            // This is an action
            let actionDescription = this.getActionDescription(element);
            let actionType = actionDescription.slice(0,3);
            let item = new TreeItem(actionDescription.slice(4), TreeItemCollapsibleState.None);
            item.contextValue = "action";
            item.tooltip = actionDescription;
            if (actionType == 'INS') {
                item.image = "sidebar-list-child-insert";
            } else if (actionType == 'DEL') {
                item.image = "sidebar-list-child-delete";
            } else if (actionType == 'POS') {
                item.image = "sidebar-list-child-position";
            } else if (actionType == 'SEL') {
                item.image = "sidebar-list-child-selection";
            }
            
            return item;
        }
    }

    getActionDescription(action) {
        switch (action.type) {
            case "INS":
                if (action.text) {
                    let escapedText = this.escapeAndTruncate(action.text, 20);
                    return `INS ${escapedText}`;
                } else {
                    return `INS (details unavailable)`;
                }
            case "POS":
                return `POS ${action.delta > 0 ? '+' : ''}${action.delta}`;
            case "SEL":
                return `SEL ${action.start}..${action.end}`;
            case "DEL":
                if (action.count) {
                    return `DEL ${action.count} char`;
                } else {
                    return `DEL (details unavailable)`;
                }
            default:
                return `ERR ${action.type}`;
        }
    }

    escapeAndTruncate(text, maxLength) {
        let escaped = text.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
        if (escaped.length > maxLength) {
            escaped = escaped.substring(0, maxLength) + "...";
        }
        return escaped;
    }
}

function handleConfigChange() {
    slowPlaybackEnabled = nova.config.get('com.gingerbeardman.macros.slowPlayback') || false;
    slowPlaybackSpeed = nova.config.get('com.gingerbeardman.macros.slowPlaybackSpeed') || 0;
}

exports.activate = function() {
    console.log("Activating Macros extension");

    // Add config change listeners
    nova.config.onDidChange('com.gingerbeardman.macros.slowPlayback', handleConfigChange);
    nova.config.onDidChange('com.gingerbeardman.macros.slowPlaybackSpeed', handleConfigChange);

    loadMacros();
    
    macrosView = new TreeView("com.gingerbeardman.macros.sidebar", {
        dataProvider: new MacrosDataProvider()
    });
    
    nova.commands.register("com.gingerbeardman.macros.toggleRecording", toggleRecording);
    nova.commands.register("com.gingerbeardman.macros.startRecording", startRecording);
    nova.commands.register("com.gingerbeardman.macros.stopRecording", stopRecording);
    nova.commands.register("com.gingerbeardman.macros.replayMacro", (workspace) => {
        let selectedItems = macrosView.selection;
        if (selectedItems && selectedItems.length > 0) {
            replayMacro(selectedItems[0]);
        }
    });
    nova.commands.register("com.gingerbeardman.macros.replayLastMacro", replayLastMacro);
    nova.commands.register("com.gingerbeardman.macros.removeMacro", (workspace) => {
        let selectedItems = macrosView.selection;
        if (selectedItems && selectedItems.length > 0) {
            removeMacro(selectedItems[0]);
        }
    });
    nova.commands.register("com.gingerbeardman.macros.renameMacro", (workspace) => {
        let selectedItems = macrosView.selection;
        if (selectedItems && selectedItems.length > 0) {
            renameMacro(selectedItems[0]);
        }
    });

    nova.subscriptions.add(macrosView);

    nova.workspace.onDidAddTextEditor((editor) => {
        editor.onDidChange(() => {
            if (isRecording) {
                let newPosition = editor.selectedRange.start;
                
                if (lastCursorPosition === null) {
                    lastCursorPosition = newPosition;
                    return;
                }
                
                let diff = newPosition - lastCursorPosition;
                
                if (diff > 0) {
                    // Characters inserted
                    let insertedText = editor.getTextInRange(new Range(lastCursorPosition, newPosition));
                    currentMacro.push({
                        type: "INS",
                        text: insertedText
                    });
                } else if (diff < 0) {
                    // Characters deleted
                    let count = Math.abs(diff);
                    currentMacro.push({
                        type: "DEL",
                        count: count
                    });
                }
                
                lastCursorPosition = newPosition;
            }
        });

        editor.onDidChangeSelection(() => {
            if (isRecording) {
                let newSelection = editor.selectedRange;
                
                if (lastSelection === null) {
                    lastSelection = newSelection;
                    lastCursorPosition = newSelection.start;
                    return;
                }
        
                if (!areSelectionsEqual(newSelection, lastSelection)) {
                    if (newSelection.length === 0) {
                        // Cursor movement without selection
                        let delta = newSelection.start - lastCursorPosition;
                        if (delta !== 0) {
                            currentMacro.push({
                                type: "POS",
                                delta: delta
                            });
                        }
                    } else {
                        // Selection
                        currentMacro.push({
                            type: "SEL",
                            start: newSelection.start,
                            end: newSelection.end
                        });
                    }
                    lastSelection = newSelection;
                    lastCursorPosition = newSelection.start;
                }
            }
        });
    });
}

function areSelectionsEqual(sel1, sel2) {
    return sel1.start === sel2.start && sel1.end === sel2.end;
}

function loadMacros() {
    let savedMacros = nova.workspace.config.get("com.gingerbeardman.macros");
    if (savedMacros) {
        try {
            macros = JSON.parse(savedMacros);
        } catch (error) {
            console.error("Error parsing saved macros:", error);
            macros = [];
        }
    } else {
        macros = [];
    }
}

function saveMacros() {
    nova.workspace.config.set("com.gingerbeardman.macros", JSON.stringify(macros));
}

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    isRecording = true;
    currentMacro = [];
    lastCursorPosition = null;
    lastSelection = null;
    let editor = nova.workspace.activeTextEditor;
    if (editor) {
        initialCursorPosition = editor.selectedRange.start;
        lastCursorPosition = initialCursorPosition;
    }
    
    let request = new NotificationRequest("macro-recording-started");
    request.title = nova.localize("Macro");
    request.body = nova.localize("Recording...");
    request.actions = [nova.localize(" STOP ")];
    
    nova.notifications.add(request).then(
        (response) => {
            console.log("Macro \"recording started\" notification shown");
            if (response.actionIdx === 0) {  // "Stop" action was clicked
                stopRecording();
            }
        },
        (error) => {
            console.error("Error showing macro recording started notification:", error);
        }
    );
}

function stopRecording() {
    isRecording = false;
    lastCursorPosition = null;
    lastSelection = null;
    if (currentMacro.length > 0) {
        let nextMacroName = "Macro " + (macros.length + 1);
        macros.push({ name: nextMacroName, actions: currentMacro });
        saveMacros();
        macrosView.reload();
    } else {
        console.log("No actions recorded in this macro.");
    }
}

async function replayLastMacro() {
    if (macros.length > 0) {
        await executeMacro(macros[macros.length - 1].actions);
    } else {
        nova.beep();
        console.log("No macros available to replay");
    }
}

async function replayMacro(name) {
    let macro = macros.find(m => m.name === name);
    if (macro) {
        await executeMacro(macro.actions);
    } else {
        nova.beep();
        console.log("Macro not found: " + name);
    }
}

function renameMacro(oldName) {
    let macro = macros.find(m => m.name === oldName);
    if (macro) {
        nova.workspace.showInputPanel("Enter new name for the macro:", {
            placeholder: oldName,
            value: oldName
        }, (newName) => {
            if (newName && newName !== oldName) {
                macro.name = newName;
                saveMacros();
                macrosView.reload();
            }
        });
    } else {
        nova.workspace.showErrorMessage("Macro not found: " + oldName);
    }
}

function removeMacro(name) {
    let index = macros.findIndex(m => m.name === name);
    if (index !== -1) {
        macros.splice(index, 1);
        saveMacros();
        macrosView.reload();
    } else {
        nova.beep();
        console.log("Macro not found: " + name);
    }
}

async function executeMacro(actions) {
    let editor = nova.workspace.activeTextEditor;
    if (!editor) {
        console.error("No active text editor");
        return;
    }

    let currentPosition = editor.selectedRange.start;
    let currentSelection = editor.selectedRange;

    for (let action of actions) {
        await editor.edit((edit) => {
            switch (action.type) {
                case "INS":
                    if (currentSelection.length > 0) {
                        // Replace the selected text
                        edit.replace(currentSelection, action.text);
                        currentPosition = currentSelection.start + action.text.length;
                    } else {
                        edit.insert(currentPosition, action.text);
                        currentPosition += action.text.length;
                    }
                    currentSelection = new Range(currentPosition, currentPosition);
                    break;
                case "DEL":
                    let startDelete = Math.max(0, currentPosition - action.count);
                    edit.delete(new Range(startDelete, currentPosition));
                    currentPosition = startDelete;
                    currentSelection = new Range(currentPosition, currentPosition);
                    break;
                case "POS":
                    currentPosition = Math.max(0, Math.min(currentPosition + action.delta, editor.document.length));
                    currentSelection = new Range(currentPosition, currentPosition);
                    break;
                case "SEL":
                    currentSelection = new Range(action.start, action.end);
                    currentPosition = action.end;
                    break;
            }
        });

        // Set cursor position or selection after each action
        editor.selectedRange = currentSelection;

        // If slow playback is enabled, add a delay between actions
        if (slowPlaybackEnabled) {
            await new Promise(resolve => setTimeout(resolve, slowPlaybackSpeed));
        }
    }
}
