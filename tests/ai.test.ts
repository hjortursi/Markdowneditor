import {describe,it,expect,vi} from 'vitest';
import {endpointURL,suggest} from '../src/main/ai';
import {blank} from '../src/main/documents';
const doc=blank('One sentence. Another sentence.');
const request={requestId:'test',documentId:doc.id,revision:0,from:0,to:13,operation:'shorten' as const};
const settings={endpoint:'http://localhost:4000/v1',model:'test-model',key:'test-only-key'};
describe('explicit AI transport',()=>{
  it('sends only the selected text and returns a proposal',async()=>{const transport=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'A sentence.'}}]}))) as unknown as typeof fetch;const result=await suggest(doc,request,settings,new AbortController().signal,transport);expect(result.original).toBe('One sentence.');expect(result.proposed).toBe('A sentence.');expect(doc.text).toContain('Another sentence.');const calls=(transport as unknown as ReturnType<typeof vi.fn>).mock.calls;expect(calls[0][0]).toBe('http://localhost:4000/v1/chat/completions');expect(JSON.parse(calls[0][1].body).messages[1].content).toBe('One sentence.');expect(calls[0][1].redirect).toBe('error');});
  it('rejects stale requests before any upload',async()=>{const transport=vi.fn();await expect(suggest({...doc,revision:2},request,settings,new AbortController().signal,transport)).rejects.toThrow('changed');expect(transport).not.toHaveBeenCalled();});
  it('rejects insecure endpoints and credentials in URLs',()=>{expect(()=>endpointURL('http://example.com')).toThrow('HTTPS');expect(()=>endpointURL('https://key:secret@example.com')).toThrow('credentials');expect(endpointURL('https://example.com/v1/')).toBe('https://example.com/v1');});
  it('reports errors and empty responses without leaking credentials',async()=>{await expect(suggest(doc,request,settings,new AbortController().signal,async()=>new Response('key-details',{status:401}))).rejects.toThrow('HTTP 401');await expect(suggest(doc,request,settings,new AbortController().signal,async()=>new Response('{}'))).rejects.toThrow('text suggestion');});
});
