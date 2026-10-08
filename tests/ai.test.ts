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

describe('built-in provider adapters',()=>{
  it('sends a custom editing instruction separately from the selected text to Claude',async()=>{
    const transport=vi.fn(async()=>new Response(JSON.stringify({content:[{type:'thinking',thinking:'internal'},{type:'text',text:'Friendlier words.'}],stop_reason:'end_turn'})));
    const result=await suggest(doc,{...request,operation:'edit',prompt:'Make this friendlier'},{provider:'anthropic',endpoint:'https://api.anthropic.com/v1',model:'claude-test',key:'fake-claude'},new AbortController().signal,transport);
    expect(result.proposed).toBe('Friendlier words.');const [url,init]=transport.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://api.anthropic.com/v1/messages');expect(init.headers).toMatchObject({'x-api-key':'fake-claude','anthropic-version':'2023-06-01'});
    const body=JSON.parse(init.body as string);expect(body.system).toContain('Make this friendlier');expect(body.messages).toEqual([{role:'user',content:'One sentence.'}]);expect(body.max_tokens).toBeGreaterThan(0);
  });
  it('uses Gemini headers, an escaped model path and only the chosen passage',async()=>{
    const transport=vi.fn(async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'internal'},{text:'Edited words.'}]}}]})));
    const result=await suggest(doc,{...request,operation:'edit',prompt:'Use simpler words'},{provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'models/example/model',key:'fake-gemini'},new AbortController().signal,transport);
    const [url,init]=transport.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/example%2Fmodel:generateContent');expect(url).not.toContain('fake-gemini');expect(init.headers).toMatchObject({'x-goog-api-key':'fake-gemini'});expect(JSON.parse(init.body as string).contents).toEqual([{role:'user',parts:[{text:'One sentence.'}]}]);expect(result.proposed).toBe('Edited words.');
  });
  it.each(['openai','openrouter'] as const)('supports %s directly without a local server',async provider=>{
    const endpoint=provider==='openai'?'https://api.openai.com/v1':'https://openrouter.ai/api/v1';const transport=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'Updated.'},finish_reason:'stop'}]})));
    await suggest(doc,request,{provider,endpoint,model:'user-chosen-model',key:'fake-key'},new AbortController().signal,transport);const [url,init]=transport.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe(endpoint+'/chat/completions');expect(init.headers).toMatchObject({Authorization:'Bearer fake-key'});const body=JSON.parse(init.body as string);expect(body.model).toBe('user-chosen-model');expect(body).not.toHaveProperty('temperature');if(provider==='openai')expect(body.store).toBe(false);
  });
  it('requires cloud credentials and a valid prompt before uploading',async()=>{
    const transport=vi.fn();await expect(suggest(doc,request,{provider:'openai',endpoint:'https://api.openai.com/v1',model:'test',key:''},new AbortController().signal,transport)).rejects.toThrow('API key');
    await expect(suggest(doc,{...request,operation:'edit',prompt:' '},settings,new AbortController().signal,transport)).rejects.toThrow('instruction');expect(transport).not.toHaveBeenCalled();
  });
  it('rejects a nonstandard named-provider endpoint before sharing its key',async()=>{
    const transport=vi.fn();await expect(suggest(doc,request,{provider:'anthropic',endpoint:'https://example.com/v1',model:'test',key:'private-test'},new AbortController().signal,transport)).rejects.toThrow('standard endpoint');expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    {provider:'anthropic' as const,endpoint:'https://api.anthropic.com/v1',response:{stop_reason:'max_tokens',content:[{type:'text',text:'Partial.'}]}},
    {provider:'gemini' as const,endpoint:'https://generativelanguage.googleapis.com/v1beta',response:{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'Partial.'}]}}]}},
    {provider:'openai' as const,endpoint:'https://api.openai.com/v1',response:{choices:[{finish_reason:'length',message:{content:'Partial.'}}]}}
  ])('never offers a truncated $provider response as a replacement',async value=>{
    await expect(suggest(doc,request,{...value,model:'test',key:'fake-key'},new AbortController().signal,async()=>new Response(JSON.stringify(value.response)))).rejects.toThrow(/cut short|did not finish/);
  });
});
