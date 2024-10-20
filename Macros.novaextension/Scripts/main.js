let slowPlaybackEnabled = nova.config.get('com.gingerbeardman.macros.slowPlayback') || false;
let slowPlaybackSpeed = nova.config.get('com.gingerbeardman.macros.slowPlaybackSpeed') || 0;

var macros = [];
var isRecording = false;
var currentMacro = [];
var macrosView;
var lastCursorPosition = null;
var initialCursorPosition = null;
var lastSelection = null;
var lastContent = "";

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

            let item = new TreeItem(element, macro.isExpanded ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed);
            item.command = "com.gingerbeardman.macros.replayMacro";
            item.contextValue = "macro";
            item.tooltip = `${element} (${macro.actions.length} actions)`;
            item.descriptiveText = `＝ ${macro.actions.length} actions`;
            item.image = "sidebar-list-item";

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
                return `SEL ${action.delta > 0 ? '+' : ''}${action.delta}`;
            case "DEL":
                if (action.count) {
                    return `DEL ${action.count}`;
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

    nova.commands.register("com.gingerbeardman.macros.toggleExpansion", (workspace) => {
        let selectedItems = macrosView.selection;
        if (selectedItems && selectedItems.length > 0) {
            toggleMacroExpansion(selectedItems[0]);
        }
    });

    nova.subscriptions.add(macrosView);

    macrosView.onDidExpandElement((element) => {
        if (typeof element === 'string') {
            let macro = macros.find(m => m.name === element);
            if (macro) {
                macro.isExpanded = true;
                saveMacros();
            }
        }
    });

    macrosView.onDidCollapseElement((element) => {
        if (typeof element === 'string') {
            let macro = macros.find(m => m.name === element);
            if (macro) {
                macro.isExpanded = false;
                saveMacros();
            }
        }
    });

    nova.workspace.onDidAddTextEditor((editor) => {
        editor.onDidChange(() => {
            if (isRecording) {
                let newPosition = editor.selectedRange.start;
                let newContent = editor.getTextInRange(new Range(0, editor.document.length));
                
                if (lastCursorPosition === null) {
                    lastCursorPosition = newPosition;
                    lastContent = newContent;
                    return;
                }
                
                // Find the difference between the old and new content
                let diff = findDifference(lastContent, newContent);
                
                if (diff.inserted) {
                    currentMacro.push({
                        type: "INS",
                        text: diff.text
                    });
                    // Adjust cursor position after insertion
                    newPosition = diff.position + diff.text.length;
                } else if (diff.deleted) {
                    currentMacro.push({
                        type: "DEL",
                        count: diff.count
                    });
                    // Adjust cursor position after deletion
                    newPosition = diff.position;
                }
                
                // Update cursor position if it has changed significantly
                if (Math.abs(newPosition - lastCursorPosition) > diff.text?.length || 0) {
                    currentMacro.push({
                        type: "POS",
                        delta: newPosition - lastCursorPosition
                    });
                }
                
                lastCursorPosition = newPosition;
                lastContent = newContent;
                lastSelection = null; // Clear last selection after content change
            }
        });

        editor.onDidChangeSelection(() => {
            if (isRecording) {
                let newSelection = editor.selectedRange;
                
                if (!areSelectionsEqual(newSelection, lastSelection)) {
                    let selectionStartDelta = newSelection.start - lastCursorPosition;
                    let selectionLength = newSelection.end - newSelection.start;
                    
                    if (selectionLength > 0) {
                        currentMacro.push({
                            type: "SEL",
                            delta: selectionStartDelta,
                            length: selectionLength
                        });
                    }
                    
                    lastSelection = newSelection;
                    lastCursorPosition = newSelection.end;
                }
            }
        });
    });
}

function findDifference(oldContent, newContent) {
    let i = 0;
    while (i < oldContent.length && i < newContent.length && oldContent[i] === newContent[i]) {
        i++;
    }
    
    let j = 1;
    while (j <= oldContent.length - i && j <= newContent.length - i &&
           oldContent[oldContent.length - j] === newContent[newContent.length - j]) {
        j++;
    }
    j--;
    
    if (i < newContent.length - j) {
        return { inserted: true, text: newContent.slice(i, newContent.length - j), position: i };
    } else if (i < oldContent.length - j) {
        return { deleted: true, count: oldContent.length - j - i, position: i };
    }
    
    return { noChange: true };
}

function areSelectionsEqual(sel1, sel2) {
    return sel1 && sel2 && sel1.start === sel2.start && sel1.end === sel2.end;
}

function loadMacros() {
    let savedMacros = nova.workspace.config.get("com.gingerbeardman.macros");
    if (savedMacros) {
        try {
            macros = JSON.parse(savedMacros);
            // Ensure each macro has an isExpanded property
            macros.forEach(macro => {
                if (typeof macro.isExpanded === 'undefined') {
                    macro.isExpanded = false; // Default to collapsed
                }
            });
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

function toggleMacroExpansion(macroName) {
    let macro = macros.find(m => m.name === macroName);
    if (macro) {
        macro.isExpanded = !macro.isExpanded;
        saveMacros();
        macrosView.reload();
    }
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

function coalesceActions(actions) {
    let coalesced = [];
    let current = null;

    for (let action of actions) {
        if (!current) {
            current = {...action};
        } else if (current.type === action.type) {
            switch (current.type) {
                case "INS":
                    current.text += action.text;
                    break;
                case "DEL":
                    current.count += action.count;
                    break;
                case "POS":
                    current.delta += action.delta;
                    break;
                case "SEL":
                    // For SEL, we update to the latest selection
                    current = {...action};
                    break;
                default:
                    coalesced.push(current);
                    current = {...action};
            }
        } else {
            coalesced.push(current);
            current = {...action};
        }
    }

    if (current) {
        coalesced.push(current);
    }

    return coalesced;
}

function stopRecording() {
    isRecording = false;
    lastCursorPosition = null;
    lastSelection = null;
    if (currentMacro.length > 0) {
        let coalescedMacro = coalesceActions(currentMacro);
        let nextMacroName = "Macro " + (macros.length + 1);
        macros.push({ name: nextMacroName, actions: coalescedMacro });
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
    let currentSelection = null;

    for (let action of actions) {
        await editor.edit((edit) => {
            switch (action.type) {
                case "INS":
                    if (currentSelection) {
                        // If there's a selection, replace it
                        edit.replace(currentSelection, action.text);
                        currentPosition = currentSelection.start + action.text.length;
                        currentSelection = null;
                    } else {
                        edit.insert(currentPosition, action.text);
                        currentPosition += action.text.length;
                    }
                    break;
                case "DEL":
                    let startDelete = Math.max(0, currentPosition - action.count);
                    edit.delete(new Range(startDelete, currentPosition));
                    currentPosition = startDelete;
                    break;
                case "POS":
                    currentPosition = Math.max(0, Math.min(currentPosition + action.delta, editor.document.length));
                    currentSelection = null;
                    break;
                case "SEL":
                    let selectionStart = Math.max(0, Math.min(currentPosition + action.delta, editor.document.length));
                    let selectionEnd = Math.max(0, Math.min(selectionStart + action.length, editor.document.length));
                    currentSelection = new Range(selectionStart, selectionEnd);
                    currentPosition = selectionEnd;  // Move cursor to end of selection
                    break;
            }
        });

        // Update the visible selection
        if (currentSelection) {
            editor.selectedRange = currentSelection;
        } else {
            editor.selectedRange = new Range(currentPosition, currentPosition);
        }

        // If slow playback is enabled, add a delay between actions
        if (slowPlaybackEnabled) {
            await new Promise(resolve => setTimeout(resolve, slowPlaybackSpeed));
        }
    }

    // Ensure the cursor is at the final position after macro execution
    editor.selectedRange = new Range(currentPosition, currentPosition);
}
