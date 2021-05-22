
const fs = require('fs')
const http = require('http')
const config  = require('./apiconfig.json') 


interface JsonApi {
  "_id": number,
  "method": "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "HEAD" | "TRACE" | "CONNECT",
  "catid": number,
  "title": string,
  "path": string,
  "project_id": number,
  "res_body_type": string,
  "uid": number,
  "add_time": number,
  "up_time": number,
  "__v": number,
  "markdown": string,
  "desc": string,
  "res_body": string,
  "tag": string[],
  "index": number,
  "api_opened": boolean,
  "res_body_is_json_schema": boolean,
  "req_body_form": JsonReqBodyForm[],
  "req_body_is_json_schema": boolean,
  "req_params": JsonReq[],
  "req_headers": JsonReqHeaders[],
  "req_query": JsonReq[],
  "query_path": {
    "path": string,
    "params": []
  },
  "type": string,
  "status": string,
  "edit_uid": number
}
interface JsonApiList {
  name: string,
  desc: string | null,
  add_time: number,
  up_time: number,
  index: number,
  list: JsonApi[],
  proBasepath: string
}
interface JsonSchemaObject {
  title: string | null
  type: 'array' | 'number' | 'string' | 'boolean' | 'object' | 'integer'
  /**
   * 数组模型
   */
  items: JsonSchemaObject | string
  /**
   * 备注
   */
  description: string | null
  /**
   * 定义属性
   */
  properties: {
    [key in string]: JsonSchemaObject
  }
  /**
   * 必需属性
   */
  required: string[]
}

interface JsonReq {
  required: '0' | '1'
  name: string,
  example: string,
  desc: string
}
interface JsonReqHeaders {
  required: '0' | '1',
  name: string,
  value: string
}
interface JsonReqBodyForm {
  "required": "1",
  "name": "password",
  "type": "text",
  "example": "",
  "desc": ""
}
interface ReqDescription {
  value: string | 'emty',
  paramsType:string
  desc:string,
  map: {
    [key:string]: JsonReq | JsonReqHeaders
  }
}
interface ReqDescriptionHead {
  value: string | 'emty',
  paramsType:string
  desc:string,
  map: {
    name: string,
    value:string
  }[]
}

interface ApiParseValue {
  name: string,
  title: string,
  desc: string,
  method: JsonApi["method"],
  query_path: string,
  req: {
    req_params:  ReqDescription,
    req_query: ReqDescription,
    req_headers: ReqDescriptionHead,
    req_body_form: ReqDescription,
  },              
  res_body: JsonSchemaObject
}

let apiList:ApiParseValue[] = []
getYApiList()

function getYApiList() {
  let url  = config.yapiConfig.url
  http.get(url, function (res) {
    let _ctx = ''
    res.on("data", function (data: any) {
        _ctx = _ctx + data
    });
    res.on("end", function () {
        // console.log('ctx :>> ', _ctx);
        startParse(JSON.parse(_ctx));
    })
    res.on('error',function (err) {
      console.log(err);
    })

  })
}
function startParse(jsonApiList: JsonApiList[]) {
  if (jsonApiList.length > 0) {
    jsonApiList.forEach((api) => {
      api.list.forEach((item) => {
        let apiname =''
        let _title:string = config.yapiConfig.categoryMap[item.title]
        let _flag = new RegExp(/([A-Z]|[a-z])/);
        if ( _title || _flag.test(item.title)) {
          let jsonApi = item
          apiname = _flag.test(item.title) ? item.title : _title
          if(jsonApi.res_body) {
            let model = (<JsonSchemaObject> JSON.parse(jsonApi.res_body))
            apiList.push({
              name: apiname,
              title: item.title,
              desc: item.desc,
              method: item.method,
              query_path: item.query_path.path,
              req: {
                req_params: parseParams(item.req_params,'params') ,
                req_query: parseParams(item.req_query, 'query'),
                req_headers: parseHeaders(item.req_headers),
                req_body_form: parseBodyForm(item.req_body_form),
              },              
              res_body: model
            })
          }
        } else  {
          console.log(`接口"${item.title}"缺少英文名称, path:${item.path}, query_method:${item.method}`);
        }
      })
    })

    creatApiListJS(apiList)
    creatApiListDts(apiList)
  }
}

function creatApiListJS(apiList:ApiParseValue[]) {
  let _apiListText = ''
  let _apiFuncList = ''
  apiList.forEach((api)=>{
    _apiListText += creatApi(api)
    _apiFuncList += `\t${api.name},\n`
  })
  let output = `
    import api from "${ config.axios.packageUrl }";
    const host = \`\$\{ \(process.env.isMock ? process.env.mockUrl : 
                            process.env.isProxy && !process.server ? process.env.proxyPath :
                              process.env.backServerUrl
      \)\}\`
    ${_apiListText}

    \rexport {
      \n${_apiFuncList}
    \r}
  `
  console.log("creatApiListJS");
  // console.log(output);
  creatFile(config.file.name || "API_test", 'js', output)
  // return output
}
function creatApiListDts(apiList:ApiParseValue[]) {
  let _apiListText = `
    // import { AxiosPromise } from "Axios";\n
    type ApiPromise<T> = Promise<T>
  `
  let _apiFuncList = ''
  apiList.forEach((api)=>{
    _apiListText += creatApiFuncDts(api)
  })
  let output = `
    ${_apiListText}
  `
  console.log("creatApiListDts");
  creatFile(config.file.name || "APi_test", 'dts', output)
}
function creatApi(api:ApiParseValue) {
  // ${api.req.req_headers.value !== 'emty' ? 'req_headers,' : ''}
  let _params = `{
    ${api.req.req_query.value !== 'emty' ? 'req_query,' : ''}
    
    ${api.req.req_body_form.value !== 'emty' ? 'req_body_form,' : ''}
    ${api.req.req_params.value !== 'emty' ? 'req_params,' : ''}
  }`
  
  let reqOption = (method:string) => {
    if(method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return `
        params: ${api.req.req_query.value !== 'emty' ? 'req_query,' : '{},'}
      `
    } else {
      return `
        params: ${api.req.req_query.value !== 'emty' ? 'req_query,' : '{},'}
        data: ${api.req.req_body_form.value !== 'emty' ? 'req_body_form,' : '{}'}
      `
    }
  } 
  let parseUrl = (url: string, paramsMap: ReqDescription['map']) => {
    let _newUrl = url;
    let _target = _newUrl.match(/:([A-Z]|[a-z])+\//g)
    Object.keys(paramsMap).forEach((tag)=>{
      _target.forEach((params)=>{
        _newUrl = _newUrl.replace(params, `\$\{req_params.${tag}\}/`)
      })
    })
   return _newUrl

  }
  let isFormData = false
  let _headers = ''
  api.req.req_headers.map.forEach((item,index)=>{
    if(index === api.req.req_headers.map.length - 1) {
      _headers += `"${item.name}":"${item.value}"`
    } else {
      _headers += `"${item.name}":"${item.value}",`
    }
    if(item.value.indexOf('x-www-form-urlencoded') > -1) {
      isFormData = true
    }
  })
  let headers = `headers: {${_headers}}`
  let _newApiFunc = '';
  if(!isFormData){
    _newApiFunc = `
      function ${api.name}(${_params}) {
          
          return api({
            method: '${api.method.toLowerCase()}',
            url: \`\$\{host\}${parseUrl(api.query_path, api.req.req_params.map) }\`,
            ${api.req.req_headers.value !== 'emty' ? headers+',' : ''}
            ${reqOption(api.method.toLowerCase())}
          })
      }
    `
  } else {
    _newApiFunc = `
      function ${api.name}(${_params}) {
          let _form = new FormData()
          Object.keys(req_body_form).forEach((key)=>{
            _form.set(key, req_body_form[key])
          })
          req_body_form = _form
          return api({
            method: '${api.method.toLowerCase()}',
            url: \`\$\{host\}${parseUrl(api.query_path, api.req.req_params.map) }\`,
            ${api.req.req_headers.value !== 'emty' ? headers+',' : ''}
            ${reqOption(api.method.toLowerCase())}
          })
      }
    `
  }
  return _newApiFunc
}
function creatApiFuncDts(api:ApiParseValue) {
  let ifReqDescription = (params:ReqDescription | ReqDescriptionHead, type:string) => {
    if(params.value !== 'emty') {
      return `
        ${type}: {
          ${params.paramsType}
        },
      `
    } else {
      return ''
    }
  }
  // ${
  //   ifReqDescription(api.req.req_headers, "req_headers")
  // }
  let _apiFuncDts = `
    
    export function ${api.name}(req:{
      ${
        ifReqDescription(api.req.req_params, "req_params")
      }
      ${
        ifReqDescription(api.req.req_query, "req_query")
      }
      ${
        ifReqDescription(api.req.req_body_form, "req_body_form")
      }
    }):${
        
        parseResBody(api.res_body)
      }
    
  `
  return _apiFuncDts
}
function creatFile(fileName: string, fileType: 'js' | 'dts', content: string) {
  let _fileType = {
    'js': 'js',
    'dts': 'd.ts'
  }
  // 创建文件

  fs.writeFile((`${config.file.outurl || './api'}/${fileName}.${_fileType[fileType]}`), content, function (err: NodeJS.ErrnoException | null) {
      if (err) {
          console.log(err)
      } else {
          console.log("写入成功")
      }
  })
}



/**
 * 解析请求参数
 * @param params 参数
 */
function parseParams(params:JsonReq[], type:string) {

  let _paramsType = ''
  let _desc = ''
  let _value = params.length === 0 ? 'emty' : ''
  let _map = {}
  params.forEach((item)=>{
    _value += `${item.name},\n`
    _map[`${item.name}`] = item
    _paramsType += `${item.name}:string,`,
    _desc += `* @param ${type}.${item.name} ${item.desc}\n`
  })

  let _obj= {
    value: _value,
    map: _map,
    paramsType: _paramsType,
    desc: _desc
  }
  
  return _obj
}

/**
 * 解析请求头
 * @param params 
 */
function parseHeaders(params:JsonReqHeaders[]) {
  let _paramsType = ''
  let _desc = ''
  let _value = params.length === 0 ? 'emty' : ''
  let _name = ''
  let _map = [] as {name:string,value:string}[]
  
  params.forEach((item)=>{
    _map.push({
      name: item.name,
      value: item.value
    })
    _paramsType += item.required === '1' ? `"${item.name}":string,`: `"${item.name}"?:string,`
    _desc += `* @param headers.${item.name} defaultValue: ${item.value}\n`
  })

  let _obj= {
    value: _value,
    map: _map,
    paramsType: _paramsType,
    desc: _desc
  }
  
  return _obj
}
/**
 * 解析表单数据
 * @param params 
 */
function parseBodyForm(params:JsonReqBodyForm[]) {
  let _paramsType = ''
  let _desc = ''
  let _value = params.length === 0 ? 'emty' : ''
  let _map = {}
  let switchType = (type:string) => {
    if(type === 'text') {
      return 'string'
    } else {
      return 'File | FileList'
    }
  }
  params.forEach((item)=>{
    _value += `${item.name},\n`
    _map[`${item.name}`] = item    
    _paramsType += item.required === '1' ? `${item.name}:${switchType(item.type)},`: `${item.name}?:${switchType(item.type)},`
    _desc += `* @param headers.${item.name} ${item.desc}\n`
  })

  let _obj= {
    value: _value,
    map: _map,    
    paramsType: _paramsType,
    desc: _desc
  }
  
  return _obj
}

function parseResBody(body:JsonSchemaObject){
  
  switch(body.type) {
    case 'object':
      return `ApiPromise<{ ${parseResBodyItem(body)} }>`
      break; 
    case 'array':
      return `ApiPromise<${parseResBodyItem(body)}[]>`
      break;
    
    default:
      
      return `ApiPromise< ${ parseResBodyItem(body)} >`
      break;
        
  }
}
/**
 * 解析返回数据合集
 * @param body 
 */
function parseResBodyItem(body:JsonSchemaObject) {

  let output = ''
  switch (body.type) {
    case "object":
      Object.keys(body.properties).forEach((key) => {
        let _itemType = body.properties[key].type
        switch (_itemType) {
          case 'object':
            output += `${key}: { ${parseResBodyItem(body.properties[key])} } \n`
            // output += `${key}:debug\n`
            break;
  
          case 'array':
            output += `${key}:${parseResBodyItem(body.properties[key])}[]\n`
            // output += `${key}:debug\n`
            break;
          case 'integer':
            output += `${key}:number\n`
            
            break;
          default:
            output += `${key}:${_itemType}\n`
            
            break;
        }
      })
      
      break;
    case "array":
      let _body = (<{
                    items: JsonSchemaObject,
                    type: 'array'
                  }> body)
      // console.log('-----------------');
      // console.log('_body :>> ', _body);
      switch (_body.items.type) {
        case 'object':
          output += `{ ${parseResBodyItem(_body.items)} }`
          break;

        case 'array':
          output += `${parseResBodyItem(_body.items)}[]`
          break;
        case 'integer':
            output += `number`
            
            break;
        default:
          output += `${_body.items.type}`
          
          break;
      }
      
      break;
  }
  // console.log('parseResBodyItem', output);
  return output
}