import fs from 'node:fs';
import path from 'node:path';
import ort from 'onnxruntime-node';
import {AutoTokenizer, env} from '@huggingface/transformers';
env.allowRemoteModels=false;env.allowLocalModels=true;
const root=path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/,'$1');
const outputDir=path.dirname(new URL(import.meta.url).pathname);
const artifactRoot='reports/major_agnostic_20261015/runtime_diagnostic';
const input=JSON.parse(fs.readFileSync(path.join(artifactRoot,'python.json'),'utf8'));
const model=path.resolve('models/major_agnostic/selected_onnx').replaceAll('\\','/')+'/';
const tokenizer=await AutoTokenizer.from_pretrained(model);
const tokens=[];
for(const text of input.texts){const row=await tokenizer([text],{padding:true,truncation:true});tokens.push(row);}
function comparison(a,b){let dot=0,aa=0,bb=0,max=0;for(let j=0;j<a.length;j++){dot+=a[j]*b[j];aa+=a[j]*a[j];bb+=b[j]*b[j];max=Math.max(max,Math.abs(a[j]-b[j]));}return{cosine:dot/Math.sqrt(aa*bb),max_abs:max};}
const result={node_ort:JSON.parse(fs.readFileSync('node_modules/onnxruntime-node/package.json')).version,token_checks:[],comparisons:{}};
for(let i=0;i<tokens.length;i++)for(const key of ['input_ids','attention_mask','token_type_ids']){
  const actual=tokens[i][key]?.tolist().map(row=>row.map(Number));
  result.token_checks.push({row:i,key,equal:JSON.stringify(actual)===JSON.stringify(input.tokens[i][key])});
}
for(const level of ['all','disabled']){
 const session=await ort.InferenceSession.create(path.join(model,'onnx/model_quantized.onnx'),{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1,graphOptimizationLevel:level});
 const vectors=[];
 for(const row of tokens){
  const feed={};for(const key of session.inputNames){const t=row[key];feed[key]=new ort.Tensor('int64',t.data,t.dims);}
  const output=await session.run(feed);const hidden=output[session.outputNames[0]];
  const dim=hidden.dims.at(-1);const count=hidden.dims[1];const vector=new Float32Array(dim);
  for(let j=0;j<dim;j++){let sum=0;for(let t=0;t<count;t++)sum+=hidden.data[t*dim+j];vector[j]=sum/count;}
  let norm=Math.sqrt(vector.reduce((sum,x)=>sum+x*x,0));for(let j=0;j<dim;j++)vector[j]/=norm;
  vectors.push(Array.from(vector));
 }
 result.comparisons[level]={python_same_mode:vectors.map((v,i)=>comparison(v,input.vectors[level][i])),python_fixture:vectors.map((v,i)=>comparison(v,input.fixture_vectors[i]))};
 await session.release();
}
fs.writeFileSync(path.join(artifactRoot,'comparison.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
