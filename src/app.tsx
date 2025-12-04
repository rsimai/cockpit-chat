import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";

import cockpit from 'cockpit';

const _ = cockpit.gettext;

export const Application = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [history, setHistory] = useState('');
    const [isBusy, setIsBusy] = useState(false);
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const outputRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    const sendMessage = () => {
        if (!input.trim() || isBusy) return;
        
        setCommandHistory(prev => [...prev, input]);
        setHistoryIndex(-1);
        setIsBusy(true);
        const userMessage = `> ${input}\n`;
        setOutput(prev => prev + userMessage);
        
        const historyUserMessage = `USER: ${input}\n`;
        const fullHistory = history + historyUserMessage;
        const proc = cockpit.spawn(['mcphost', '--quiet', '--stream', '-p', fullHistory], { err: 'message' });
        
        let responseData = '';
        proc.stream((data) => {
            responseData += data;
            setOutput(prev => prev + data);
        });
        
        proc.done(() => {
            setHistory(fullHistory + `BOT: ${responseData}\n\n`);
            setOutput(prev => prev + '\n\n');
            setIsBusy(false);
            inputRef.current?.focus();
        });
        
        proc.fail((error) => {
            setOutput(prev => prev + `Error: ${error}\n\n`);
            setIsBusy(false);
            inputRef.current?.focus();
        });
        
        setInput('');
    };

    const showHistory = () => {
        setOutput(prev => prev + '=== HISTORY ===\n' + history + '=== END HISTORY ===\n\n');
        inputRef.current?.focus();
    };

    const clearHistory = () => {
        setHistory('');
        inputRef.current?.focus();
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <Stack hasGutter>
            <StackItem>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1>Geeko AI</h1>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <Button variant="secondary" onClick={showHistory}>
                            {_("Show History")}: {formatSize(new TextEncoder().encode(history).length)}
                        </Button>
                        <Button variant="secondary" onClick={clearHistory}>
                            {_("Clear History")}
                        </Button>
                    </div>
                </div>
            </StackItem>
            <StackItem isFilled>
                <TextArea
                    ref={outputRef}
                    value={output}
                    readOnly
                    style={{ height: 'calc(100vh - 200px)', minHeight: '400px' }}
                    placeholder={_("Chat messages will appear here...")}
                />
            </StackItem>
            <StackItem>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <TextInput
                        ref={inputRef}
                        value={input}
                        onChange={(_, value) => setInput(value)}
                        placeholder={_("Enter message...")}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isBusy) {
                                sendMessage();
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                if (commandHistory.length > 0) {
                                    const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
                                    setHistoryIndex(newIndex);
                                    setInput(commandHistory[newIndex]);
                                }
                            } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (historyIndex >= 0) {
                                    const newIndex = historyIndex + 1;
                                    if (newIndex >= commandHistory.length) {
                                        setHistoryIndex(-1);
                                        setInput('');
                                    } else {
                                        setHistoryIndex(newIndex);
                                        setInput(commandHistory[newIndex]);
                                    }
                                }
                            }
                        }}
                        isDisabled={isBusy}
                        style={{ flex: 1 }}
                    />
                    <Button onClick={sendMessage} isDisabled={!input.trim() || isBusy} isLoading={isBusy}>
                        {isBusy ? _("Sending...") : _("Send")}
                    </Button>
                </div>
            </StackItem>
        </Stack>
    );
};