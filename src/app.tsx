import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea/index.js";

import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";

import cockpit from 'cockpit';

const _ = cockpit.gettext;



export const Application = () => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [history, setHistory] = useState('');
    const [isBusy, setIsBusy] = useState(false);
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [tools, setTools] = useState([]);
    const [selectedTool, setSelectedTool] = useState(null);
    const [selectedToolName, setSelectedToolName] = useState('');
    const [configError, setConfigError] = useState('');
    const [currentProcess, setCurrentProcess] = useState(null);
    const [currentResponse, setCurrentResponse] = useState('');

    const messagesRef = useRef(null);
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
                    const [name, label, command, ...rest] = parts;
                    
                    // Find environment section (starts with ENV:)
                    let envVars = {};
                    let argParts = rest;
                    const envIndex = rest.findIndex(part => part.trim().startsWith('ENV:'));
                    if (envIndex !== -1) {
                        const envPart = rest[envIndex].trim().substring(4); // Remove 'ENV:'
                        if (envPart) {
                            envPart.split(',').forEach(pair => {
                                const [key, value] = pair.split('=', 2);
                                if (key && value) {
                                    envVars[key.trim()] = value.trim();
                                }
                            });
                        }
                        argParts = rest.slice(0, envIndex);
                    }
                    
                    const allArgs = argParts.join(' ').trim();
                    return {
                        name: name.trim(),
                        label: label.trim(),
                        command: command.trim(),
                        args: allArgs ? allArgs.split(/\s+/) : [],
                        env: envVars
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
        if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
    }, [messages, currentResponse]);

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
        setMessages(prev => [...prev, { type: 'user', content: input }]);
        setCurrentResponse('');
        
        const historyUserMessage = `USER: ${input}\n`;
        const fullHistory = history + historyUserMessage;
        const command = [selectedTool.command, ...selectedTool.args, history + input];
        const options = { err: 'message' };
        if (selectedTool.env && Object.keys(selectedTool.env).length > 0) {
            options.environ = selectedTool.env;
        }
        console.log('Executing command:', command, 'with env:', selectedTool.env);
        let proc;
        try {
            proc = cockpit.spawn(command, options);
            console.log('Process spawned successfully');
            setCurrentProcess(proc);
        } catch (spawnError) {
            console.error('Failed to spawn process:', spawnError);
            setMessages(prev => [...prev, { type: 'error', content: `Spawn Error: ${spawnError}` }]);
            setIsBusy(false);
            inputRef.current?.focus();
            return;
        }
        
        let responseData = '';
        let hasOutput = false;
        
        // Timeout after 30 seconds if no response
        const timeout = setTimeout(() => {
            console.log('Process timeout - no response after 30s');
            if (proc) {
                proc.close();
                setMessages(prev => [...prev, { type: 'error', content: 'Timeout - no response after 30 seconds' }]);
                setCurrentResponse('');
                setIsBusy(false);
                setCurrentProcess(null);
                inputRef.current?.focus();
            }
        }, 30000);
        
        proc.stream((data) => {
            console.log('Command output:', data);
            hasOutput = true;
            clearTimeout(timeout);
            responseData += data;
            setCurrentResponse(responseData);
        });
        
        proc.done(() => {
            console.log('Process completed. Has output:', hasOutput, 'Response length:', responseData.length);
            clearTimeout(timeout);
            if (!hasOutput && responseData.length === 0) {
                setMessages(prev => [...prev, { type: 'error', content: 'No output from command' }]);
            } else {
                setMessages(prev => [...prev, { type: 'bot', content: responseData }]);
            }
            setHistory(fullHistory + `BOT: ${responseData}\n\n`);
            setCurrentResponse('');
            setIsBusy(false);
            setCurrentProcess(null);
            inputRef.current?.focus();
        });
        
        proc.fail((error) => {
            console.log('Process failed:', error);
            clearTimeout(timeout);
            setMessages(prev => [...prev, { type: 'error', content: `Error: ${error}` }]);
            setCurrentResponse('');
            setIsBusy(false);
            setCurrentProcess(null);
            inputRef.current?.focus();
        });

        
        setInput('');
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const showHistory = () => {
        setMessages(prev => [...prev, { type: 'system', content: `=== HISTORY ===\n${history}=== END HISTORY ===` }]);
        inputRef.current?.focus();
    };

    const clearHistory = () => {
        setHistory('');
        setMessages([]);
        setCurrentResponse('');
        inputRef.current?.focus();
    };

    const stopProcess = () => {
        if (currentProcess) {
            currentProcess.close();
            setMessages(prev => [...prev, { type: 'error', content: 'Process stopped' }]);
            setCurrentResponse('');
            setIsBusy(false);
            setCurrentProcess(null);
            inputRef.current?.focus();
        }
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
                        <Button variant="danger" onClick={stopProcess} isDisabled={!isBusy}>
                            {_("Stop")}
                        </Button>
                    </div>
                </div>
            </StackItem>
            <StackItem isFilled>
                <div 
                    ref={messagesRef}
                    style={{ 
                        height: 'calc(100vh - 200px)', 
                        minHeight: '400px',
                        overflowY: 'auto',
                        padding: '16px',
                        backgroundColor: 'var(--pf-v6-global--BackgroundColor--100)',
                        border: '1px solid var(--pf-v6-global--BorderColor--100)',
                        borderRadius: '8px'
                    }}
                >
                    {messages.length === 0 && !currentResponse && (
                        <div style={{ color: 'var(--pf-v6-global--Color--200)', textAlign: 'center', marginTop: '50px' }}>
                            {_("Chat messages will appear here...")}
                        </div>
                    )}
                    {messages.map((msg, index) => (
                        <div key={index} style={{ 
                            display: 'flex', 
                            justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                            marginBottom: '12px'
                        }}>
                            <div style={{
                                maxWidth: '70%',
                                padding: '12px 16px',
                                borderRadius: '18px',
                                border: '2px solid rgba(0, 0, 0, 0.2)',
                                backgroundColor: msg.type === 'user' 
                                    ? '#0066cc' 
                                    : msg.type === 'error' 
                                    ? 'var(--pf-v6-global--danger-color--100)'
                                    : msg.type === 'system'
                                    ? 'var(--pf-v6-global--info-color--100)'
                                    : 'light-dark(#e0e0e0, #404040)',
                                color: msg.type === 'user' ? 'white' : 'var(--pf-v6-global--Color--100)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {currentResponse && (
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'flex-start',
                            marginBottom: '12px'
                        }}>
                            <div style={{
                                maxWidth: '70%',
                                padding: '12px 16px',
                                borderRadius: '18px',
                                border: '2px solid rgba(0, 0, 0, 0.2)',
                                backgroundColor: 'light-dark(#e0e0e0, #404040)',
                                color: 'var(--pf-v6-global--Color--100)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {currentResponse}
                            </div>
                        </div>
                    )}

                </div>
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
                    <Button 
                        onClick={sendMessage} 
                        isDisabled={!input.trim() || isBusy || !selectedTool} 
                        isLoading={isBusy}
                        variant={input.trim() && !isBusy && selectedTool ? "primary" : "secondary"}
                        style={input.trim() && !isBusy && selectedTool ? { backgroundColor: '#28a745', borderColor: '#28a745' } : {}}
                    >
                        {isBusy ? _("Sending...") : _("Send")}
                    </Button>
                </div>
            </StackItem>
        </Stack>
    );
};