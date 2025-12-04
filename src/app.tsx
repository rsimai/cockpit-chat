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
    const [tools, setTools] = useState([]);
    const [selectedTool, setSelectedTool] = useState(null);
    const [selectedToolName, setSelectedToolName] = useState('');
    const [configError, setConfigError] = useState('');

    const outputRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        cockpit.spawn(['whoami'])
            .then(username => {
                const configPath = '/home/' + username.trim() + '/.cockpit-chat-tools.conf';
                return cockpit.file(configPath).read();
            })
            .then(content => {
                if (!content || content.trim() === '') {
                    setConfigError('Config file is empty. Add tools to ~/.cockpit-chat-tools.conf');
                    return;
                }
                const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
                if (lines.length === 0) {
                    setConfigError('No valid tools in config. Check ~/.cockpit-chat-tools.conf format');
                    return;
                }
                const configTools = lines.map(line => {
                    const parts = line.split('|');
                    if (parts.length < 3) {
                        return null;
                    }
                    const [name, label, command, ...argParts] = parts;
                    const allArgs = argParts.join(' ').trim();
                    return {
                        name: name.trim(),
                        label: label.trim(),
                        command: command.trim(),
                        args: allArgs ? allArgs.split(/\s+/) : []
                    };
                }).filter(tool => tool !== null);
                
                if (configTools.length > 0) {
                    setTools(configTools);
                    setSelectedTool(configTools[0]);
                    setSelectedToolName(configTools[0].name);
                } else {
                    setConfigError('No valid tools parsed. Check ~/.cockpit-chat-tools.conf format');
                }
            })
            .catch((error) => {
                setConfigError('No config found. Create ~/.cockpit-chat-tools.conf');
            });
    }, []);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!isBusy) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isBusy]);

    const sendMessage = () => {
        if (!input.trim() || isBusy || !selectedTool) return;
        
        setCommandHistory(prev => [...prev, input]);
        setHistoryIndex(-1);
        setIsBusy(true);
        const userMessage = `> ${input}\n`;
        setOutput(prev => prev + userMessage);
        
        const historyUserMessage = `USER: ${input}\n`;
        const fullHistory = history + historyUserMessage;
        const command = [selectedTool.command, ...selectedTool.args, fullHistory];
        console.log('Executing command:', command);
        const proc = cockpit.spawn(command, { err: 'message' });
        
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
        setTimeout(() => inputRef.current?.focus(), 0);
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
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <h1>Geeko AI</h1>
                        {configError ? (
                            <span style={{ color: 'red' }}>{configError}</span>
                        ) : (
                            <select
                                value={selectedToolName}
                                onChange={(e) => {
                                    const tool = tools.find(t => t.name === e.target.value);
                                    if (tool) {
                                        setSelectedTool(tool);
                                        setSelectedToolName(tool.name);
                                        inputRef.current?.focus();
                                    }
                                }}
                                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                            >
                                {tools.map(tool => (
                                    <option key={tool.name} value={tool.name}>
                                        {tool.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
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
                        readOnly={isBusy}
                        style={{ flex: 1 }}
                    />
                    <Button onClick={sendMessage} isDisabled={!input.trim() || isBusy || !selectedTool} isLoading={isBusy}>
                        {isBusy ? _("Sending...") : _("Send")}
                    </Button>
                </div>
            </StackItem>
        </Stack>
    );
};