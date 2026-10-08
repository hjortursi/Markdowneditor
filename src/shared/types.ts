export type ViewMode = 'source' | 'split' | 'preview' | 'reading';
export type Action = 'new' | 'open' | 'save' | 'saveAs' | 'close';
export type Command = Action | ViewMode | 'settings' | 'rewrite' | 'shorten' | 'translate';
export interface DocumentState {id:string; path:string|null; text:string; savedText:string; revision:number; recovered?:boolean; lineEnding?:string}
export interface Snapshot {id:string; text:string; revision:number}
export type AIProvider = 'openai'|'anthropic'|'gemini'|'openrouter'|'ollama'|'custom';
export interface AIProfile {provider:AIProvider;endpoint:string;model:string;hasKey:boolean;rememberKey:boolean}
export interface AISettings extends AIProfile {profiles:AIProfile[]}
export interface SettingsInput {provider:AIProvider;endpoint:string;model:string;key?:string;rememberKey:boolean;clearKey?:boolean}
export type AIOperation = 'rewrite'|'shorten'|'translate'|'edit';
export interface AIRequest {requestId:string;documentId:string;revision:number;from:number;to:number;operation:AIOperation;language?:string;prompt?:string}
export interface AIResult {requestId:string;documentId:string;revision:number;from:number;to:number;original:string;proposed:string}
export interface LinaAPI {
  ready():Promise<{document:DocumentState;settings:AISettings}>;
  update(snapshot:Snapshot):void;
  file(action:Action,snapshot:Snapshot):Promise<DocumentState|null>;
  settings(input?:SettingsInput):Promise<AISettings>;
  suggest(request:AIRequest):Promise<AIResult>;
  cancelAI():Promise<void>;
  onCommand(callback:(command:Command)=>void):()=>void;
  onDocument(callback:(doc:DocumentState)=>void):()=>void;
}
declare global { interface Window {lina:LinaAPI} }
