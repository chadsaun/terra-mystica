var state = null;
var currentFaction = null;
var backendDomain = null;

function parseParamsFromPathname (pathname) {
    var path = pathname.sub(/\/(faction|game)\//, "").split("/");
    var expected = ["game", "faction", "key"];
    params = {};
    path.each(function(elem) {
        var match = elem.match(/(.*)=(.*)/); 
        if (match) {
            params[match[1]] = match[2]; 
        } else {
            params[expected.shift()] = elem;
        }
    });
}

function loadGame (domain, pathname) {
    if (document.location.hash &&
        document.location.hash.match(/^#\/faction/)) {
        document.location = "http://" + domain + document.location.hash.sub(/^#/, '');
    }

    parseParamsFromPathname(pathname);

    backendDomain = domain;
    state = null;

    setTitle();
    if ($("header-gamename")) {
        $("header-gamename").innerHTML = params["game"];
    }
    
    
    if ($("move_entry")) {
        $("move_entry").innerHTML = '';
    }

    if ($("preview_commands")) {
        $("preview_commands").innerHTML = '';
    }

    currentFaction = params.faction;
    preview();
}

function previewOrSave(save, preview_data, prefix_data) {
    dataEntrySetStatus(true);

    if (preview_data) {
        $("preview_status").innerHTML = "Previewing the following commands for " + currentFaction;
        $("preview_commands").innerHTML = preview_data;
    }

    var target = save ? "/app/append-game/" : "/app/view-game/";
    target = "http://" + backendDomain + target;
    if (!save) {
        spin();
    }
    new Ajax.Request(target, {
        method: "post",
        parameters: {
            // Thanks, Chrome on Android. I'm sure that randomly
            // ignoring cache control headers is *just* the right
            // thing.
            "cache-token": new Date() - Math.random(),
            "csrf-token": getCSRFToken(),
            "game": params.game,
            "preview": prefix_data + preview_data,
            "faction-key": params.key,
            "preview-faction": currentFaction,
            "max-row": params['max-row']
        },
        onFailure: function(transport){
            var data = transport.responseText.evalJSON();
            if (data && data.error) {
                state.error = data.error;
            }
            failed();
            dataEntrySetStatus(false);
        },
        onSuccess: function(transport){
            state = transport.responseText.evalJSON();
            if (save) {
                if (state.error.size() > 0) {
                    failed();
                } else {
                    $("preview_status").innerHTML = "Executed the following commands for " + currentFaction;
                    if (state.email) {
                        $("move_entry").insert(new Element("br"));
                        $("move_entry").insert(new Element("a", {"href": makeMailToLink()}).updateText("Send email"));
                    } else {
                        $("move_entry").innerHTML = "";
                    }
                    if (state.new_faction_key) {
                        parseParamsFromPathname(state.new_faction_key);
                        document.location.hash = state.new_faction_key;
                        currentFaction = params.faction;
                    }
                    fetchGames($("user-info"), "user", "running",
                               showActiveGames);
                    preview(false);
                }
            } else {
                try {
                    draw();
                    moveEntryAfterPreview();
                } catch (e) {
                    handleException(e);
                };
            }
        }
    });
}

function previewPlan() {
    var prefix_data = "start_planning.";
    var preview_data = $("planning_entry_input").value;
    previewOrSave(false, preview_data, prefix_data);
}

function preview() {
    var preview_data = $("move_entry_input") ? $("move_entry_input").value : "";
    previewOrSave(false, preview_data, "");
}

function save() {
    var preview_data = $("move_entry_input").value;
    previewOrSave(true, preview_data, "");
}

function makeMailToLink() {
    var newline = "%0D%0A";
    var status = $("preview_status").innerHTML;
    var moves = $("preview_commands").textContent.split(/\n/).map(function (x) {
        return "  " + encodeURIComponent(x);
    }).join(newline);
    var actions = $("action_required").childElements().map(function (x) {
        return "  " + encodeURIComponent(x.textContent);
    }).join(newline)
    var footer = "Round #{round}, turn #{turn}".interpolate(state);

    var moves = status + ":" + newline + moves + newline + newline + "Actions required:" + newline + actions + newline + newline + footer;

    var link = "mailto:" + encodeURIComponent(state.email) + "?subject=Re: Terra Mystica PBEM (" + params.game + ")&body=" + moves;

    return link;
}

function showActiveGames(games, div, mode, status) {
    var record = { "active_count": 0, "action_required_count": 0 };
    moveRequired = false;
    games.each(function(elem) {
        if (!elem.finished) { record.active_count++; }
        if (elem.action_required) {
            moveRequired = true;
            record.action_required_count++;
        }
    });
    $(div).innerHTML = "<div style='display: block-inline; margin-right: 10px'>Moves required in #{action_required_count}/#{active_count} games</div>".interpolate(record);

    var link = new Element('a', {"href": "#", "accesskey": "n"}).updateText("Next game");
    link.onclick = function() { fetchGames(div, mode, "running", nextGame); } 
    $(div).insert(link);

    setTitle();
}

function nextGame(games, div, mode, status) {
    games.each(function(elem) {
        if (elem.action_required) { document.location = elem.link; }
    });
    showActiveGames(games, div, mode, status);
}

function loadOrSavePlan(save) {
    dataEntrySetStatus(true);

    var target = "/app/plan/";
    target = "http://" + backendDomain + target;

    var form_params = {
        "cache-token": new Date() - Math.random(),
        "csrf-token": getCSRFToken(),
        "game": params.game,
        "faction-key": params.key,
        "preview-faction": currentFaction,
    };
    if (save) {
        form_params['set-note'] = $("planning_entry_input").value;
    }

    new Ajax.Request(target, {
        method: "post",
        parameters: form_params,
        onSuccess: function(transport){
            var notes = transport.responseText.evalJSON();
            if (notes.error.size() > 0) {
                $("planning_entry").updateText(notes.error);
            } else {
                $("planning_entry_input").value = notes.note;
            }
            dataEntrySetStatus(false);
        }
    });
}

function loadPlan() {
    loadOrSavePlan(false);
}

function savePlan() {
    loadOrSavePlan(true);
}

var plan_loaded = 0;
function initPlanIfNeeded() {
    if (plan_loaded) {
        return;
    }
    loadPlan();
    plan_loaded = 1;
}

function loadOrSendChat(send) {
    dataEntrySetStatus(true);

    var target = "/app/chat/";
    target = "http://" + backendDomain + target;

    var form_params = {
        "cache-token": new Date() - Math.random(),
        "csrf-token": getCSRFToken(),
        "game": params.game,
        "faction-key": params.key,
        "faction": currentFaction,
        "turn": "round #{round}, turn #{turn}".interpolate(state)
    };

    if (send && $("chat_entry_input").value) {
        form_params['add-message'] = $("chat_entry_input").value;
    }

    new Ajax.Request(target, {
        method: "post",
        parameters: form_params,
        onSuccess: function(transport){
            var messages = transport.responseText.evalJSON();
            if (send) {
                $("chat_entry_input").value = "";
            }
            $("chat_messages").clearContent();

            if (state.chat_hide_message_count > 0) {
                var row = new Element("tr", { id: 'chat_messages_show_old' });
                row.insert(new Element("td"));
                var link = new Element("span", { style: 'text-decoration: underline', onclick: 'showOldMessages()'});
                link.insertTextSpan("Show #{chat_hide_message_count} older messages".interpolate(state));
                row.insert(new Element("td").insert(link));
                $("chat_messages").insert(row);                
            }

            if (messages.error.size() > 0) {
                $("error").updateText(messages.error);
                dataEntrySetStatus(false);
                return;
            }

            messages.messages.each(function (entry, index) {
                var cssClass = (index < state.chat_hide_message_count ?
                                "chat-message-hidden" :
                                "chat-message-visible");
                var row = new Element("tr", {"class": cssClass});
                var from;
                try {
                    from = coloredFactionSpan(entry.faction);
                } catch (e) {
                    from = makeTextSpan(entry.faction);
                }

                row.insert(new Element("td", {"style": "white-space:nowrap"}).insert(from));

                var message_div = new Element("div", {"style": "max-width: 60ex"});
                // Normalize
                var message_text = entry.message.sub(/\n$/, "");
                message_text.split(/\n/).each(function (message_row) {
                    message_div.insert(new Element("div").updateText(message_row).insert(makeTextSpan("\u00a0")));
                });

                var posted_on_div = new Element("div", {"style": "color: #888; font-size: 75%;"});
                posted_on_div.updateText(seconds_to_pretty_time(entry.message_age) + " ago");

                if (entry.posted_on_turn) {
                    var link = new Element("a", { 'class': 'turnlink',
                                                  'href': '#' + commentAnchor(entry.posted_on_turn) });
                    link.updateText(entry.posted_on_turn);
                    posted_on_div.insertTextSpan(", ");
                    posted_on_div.insert(link);
                }

                message_div.insert(posted_on_div);
                row.insert(new Element("td").insert(message_div));

                $("chat_messages").insert(row);
            });

            $("data_entry_tab_chat").style.color = "#000";
            dataEntrySetStatus(false);
        }
    });
}

function loadChat() {
    loadOrSendChat(false);
}

function sendChat() {
    loadOrSendChat(true);
}

var chat_loaded = 0;
function initChatIfNeeded() {
    if (chat_loaded) {
        return;
    }
    newChatMessages();
    loadChat();
    chat_loaded = 1;
}

function newChatMessages() {
    state.chat_hide_message_count = Math.min(state.chat_message_count - state.chat_unread_message_count,
                                             Math.max(0, state.chat_message_count - 5));
    
    return state.chat_unread_message_count > 0;
}

function showOldMessages() {
    $$("#chat_messages tr.chat-message-hidden").each(function(row) {
        row.className = "chat-message-visible";
    });    
    $("chat_messages_show_old").hide();
}