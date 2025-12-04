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
    const outputRef = useRef(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    const sendMessage = () => {
        if (!input.trim()) return;
        
        setOutput(prev => prev + `> ${input}\n`);
        setOutput(prev => prev + `Bot: ${input}\n\n`);
        setInput('');
    };

    return (
        <Stack hasGutter>
            <StackItem>
                <h1>Chat</h1>
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
                        value={input}
                        onChange={(_, value) => setInput(value)}
                        placeholder={_("Enter message...")}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        style={{ flex: 1 }}
                    />
                    <Button onClick={sendMessage} isDisabled={!input.trim()}>
                        {_("Send")}
                    </Button>
                </div>
            </StackItem>
        </Stack>
    );
};