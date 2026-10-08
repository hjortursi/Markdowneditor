import type {AIProvider} from './types';
// Connection presets only. Models and credentials are supplied by the user.
export const providers:Record<AIProvider,{name:string;endpoint:string;protocol:'chat'|'anthropic'|'gemini';keyRequired:boolean;description:string}>={
  openai:{name:'OpenAI',endpoint:'https://api.openai.com/v1',protocol:'chat',keyRequired:true,description:'Connect directly to OpenAI with your API key.'},
  anthropic:{name:'Anthropic · Claude',endpoint:'https://api.anthropic.com/v1',protocol:'anthropic',keyRequired:true,description:'Connect directly to Claude with your Anthropic API key.'},
  gemini:{name:'Google · Gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',protocol:'gemini',keyRequired:true,description:'Connect directly to Gemini with your Google AI Studio API key.'},
  openrouter:{name:'OpenRouter',endpoint:'https://openrouter.ai/api/v1',protocol:'chat',keyRequired:true,description:'Use models from many providers with one OpenRouter API key.'},
  ollama:{name:'Ollama · local',endpoint:'http://localhost:11434/v1',protocol:'chat',keyRequired:false,description:'Use an existing Ollama server and a model installed on your Mac.'},
  custom:{name:'Custom / LiteLLM',endpoint:'http://localhost:4000/v1',protocol:'chat',keyRequired:false,description:'An OpenAI-compatible service, including LiteLLM, Groq, Mistral or LM Studio.'}
};
export const providerIds=Object.keys(providers) as AIProvider[];
export function isProvider(value:unknown):value is AIProvider{return typeof value==='string'&&Object.hasOwn(providers,value);}
