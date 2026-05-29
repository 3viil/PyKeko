// Self-contained Mol* viewer template. PyKeko replaces the
// __PYKEKO_MVS_JSON_PLACEHOLDER__ inside index.html with an MVS JSON document at
// export time. On load we parse it and hand it to Mol*'s loadMVS.
import { useEffect, useRef, useState } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { MolViewSpec } from 'molstar/lib/extensions/mvs/behavior';
import 'molstar/build/viewer/molstar.css';

const PLACEHOLDER = '__PYKEKO_MVS_JSON_PLACEHOLDER__';

export function App() {
    const hostRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState('Initializing Mol*…');

    useEffect(() => {
        if (!hostRef.current) return;
        let cancelled = false;
        let plugin: PluginUIContext | null = null;

        (async () => {
            // Default plugin UI (state tree, rep editor, snapshots, sequence panel, etc.)
            // plus the MolViewSpec behavior so loadMVS can run.
            const baseSpec = DefaultPluginUISpec();
            const spec = {
                ...baseSpec,
                behaviors: [...(baseSpec.behaviors ?? []), PluginSpec.Behavior(MolViewSpec)],
                layout: {
                    initial: {
                        isExpanded: false,
                        showControls: true,
                        controlsDisplay: 'reactive' as const,
                    },
                },
            };

            plugin = await createPluginUI({ target: hostRef.current!, spec, render: renderReact18 });
            if (cancelled) { plugin.dispose(); return; }

            const node = document.getElementById('__pykeko_mvs__');
            const text = node?.textContent?.trim();
            if (!text || text === PLACEHOLDER) {
                setStatus('No MVS data injected — this is the empty template. Generate one via PyKeko → Export.');
                return;
            }

            try {
                setStatus('Loading view…');
                const mvs = MVSData.fromMVSJ(text);
                await loadMVS(plugin, mvs, { sanityChecks: true });
                setStatus('');
            } catch (e: any) {
                console.error(e);
                setStatus(`Error loading MVS: ${e?.message ?? String(e)}`);
            }
        })().catch((e) => {
            console.error(e);
            setStatus(`Error: ${e?.message ?? String(e)}`);
        });

        return () => { cancelled = true; plugin?.dispose(); };
    }, []);

    return (
        <>
            <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
            {status && (
                <div style={{
                    position: 'absolute', top: 8, left: 8, padding: '6px 10px',
                    background: 'rgba(0,0,0,0.7)', color: '#fff', borderRadius: 4,
                    fontFamily: 'system-ui, sans-serif', fontSize: 12, zIndex: 10,
                    maxWidth: '60ch',
                }}>{status}</div>
            )}
        </>
    );
}
