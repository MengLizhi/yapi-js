"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const config = __importStar(require("./apiconfig.json"));
let apiList = [];
getYApiList();
function getYApiList() {
    let url = config.yapiConfig.url;
    let _urlParams = new url_1.URL(url);
    (_urlParams.protocol == 'http:'
        ? http
        : https).get(url, function (res) {
        let _ctx = '';
        res.on("data", function (data) {
            _ctx = _ctx + data;
        });
        res.on("end", function () {
            // console.log('ctx :>> ', _ctx);
            startParse(JSON.parse(_ctx));
        });
        res.on('error', function (err) {
            console.log(err);
        });
    });
}
function startParse(jsonApiList) {
    if (jsonApiList.length > 0) {
        jsonApiList.forEach((api) => {
            api.list.forEach((item) => {
                let apiname = '';
                let _map = config.yapiConfig.categoryMap;
                let _title = _map[item.title];
                let _flag = new RegExp(/([A-Z]|[a-z])/);
                if (_title || _flag.test(item.title)) {
                    let jsonApi = item;
                    apiname = _flag.test(item.title) ? item.title : _title;
                    if (jsonApi.res_body) {
                        parseBodyOther(item.req_body_other);
                        let model = JSON.parse(jsonApi.res_body);
                        apiList.push({
                            name: apiname,
                            title: item.title,
                            desc: item.desc,
                            method: item.method,
                            query_path: item.query_path.path,
                            req: {
                                req_params: parseParams(item.req_params, 'params'),
                                req_query: parseParams(item.req_query, 'query'),
                                req_headers: parseHeaders(item.req_headers),
                                req_body_form: parseBodyForm(item.req_body_form),
                                req_body_other: parseBodyOther(item.req_body_other),
                                req_body_type: item.res_body_type
                            },
                            res_body: model
                        });
                    }
                }
                else {
                    console.log(`接口"${item.title}"缺少英文名称, path:${item.path}, query_method:${item.method}`);
                }
            });
        });
        creatApiListJS(apiList);
        creatApiListDts(apiList);
    }
}
function creatApiListJS(apiList) {
    let _apiListText = '';
    let _apiFuncList = '';
    apiList.forEach((api) => {
        _apiListText += creatApi(api);
        _apiFuncList += `\t${api.name},\n`;
    });
    let output = `
    import api from "${config.axios.packageUrl}";
    const host = \`\$\{ \(      
      import.meta.env.VITE_isMock === 'true'
        ? import.meta.env.VITE_mockUrl 
        : import.meta.env.VITE_isProxy === 'true'
            ? import.meta.env.VITE_proxyPath 
            : import.meta.env.VITE_backServerUrl
      \)\}\`
    ${_apiListText}

    \rexport {
      \n${_apiFuncList}
    \r}
  `;
    console.log("creatApiListJS");
    // console.log(output);
    creatFile(config.file.name || "API_test", 'js', output);
    // return output
}
function creatApiListDts(apiList) {
    let _apiListText = `
    // import { AxiosPromise } from "Axios";\n
    type ApiPromise<T> = Promise<T>
  `;
    let _apiFuncList = '';
    apiList.forEach((api) => {
        _apiListText += creatApiFuncDts(api);
    });
    let output = `
    ${_apiListText}
  `;
    console.log("creatApiListDts");
    creatFile(config.file.name || "APi_test", 'dts', output);
}
function creatApi(api) {
    // ${api.req.req_headers.value !== 'emty' ? 'req_headers,' : ''}
    let _params = `{
    ${api.req.req_query.value !== 'emty' ? 'req_query,' : ''}
    
    ${api.req.req_body_form.value !== 'emty' ? 'req_body_form,' : ''}
    ${api.req.req_body_other.value !== 'emty' ? 'req_body_other,' : ''}
    ${api.req.req_params.value !== 'emty' ? 'req_params,' : ''}
  }`;
    let reqOption = (method) => {
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            return `
        params: ${api.req.req_query.value !== 'emty' ? 'req_query,' : '{},'}
      `;
        }
        else {
            return `
        params: ${api.req.req_query.value !== 'emty' ? 'req_query,' : '{},'}
        data: {
          ${api.req.req_body_form.value !== 'emty'
                ? '...req_body_form,'
                : ''}
          ${api.req.req_body_other.value !== 'emty'
                ? '...req_body_other,'
                : ''}
        }
      `;
        }
    };
    let parseUrl = (url, paramsMap) => {
        let _newUrl = url;
        let _target = _newUrl.match(/:([A-Z]|[a-z])+\//g);
        Object.keys(paramsMap).forEach((tag) => {
            _target?.forEach((params) => {
                _newUrl = _newUrl.replace(params, `\$\{req_params.${tag}\}/`);
            });
        });
        return _newUrl;
    };
    let isFormData = false;
    let _headers = '';
    api.req.req_headers.map.forEach((item, index) => {
        if (index === api.req.req_headers.map.length - 1) {
            _headers += `"${item.name}":"${item.value}"`;
        }
        else {
            _headers += `"${item.name}":"${item.value}",`;
        }
        if (item.value.indexOf('x-www-form-urlencoded') > -1) {
            isFormData = true;
        }
    });
    let headers = `headers: {${_headers}}`;
    let _newApiFunc = '';
    if (!isFormData) {
        _newApiFunc = `
      function ${api.name}(${_params}) {
          
          return api({
            method: '${api.method.toLowerCase()}',
            url: \`\$\{host\}${parseUrl(api.query_path, api.req.req_params.map)}\`,
            ${api.req.req_headers.value !== 'emty' ? headers + ',' : ''}
            ${reqOption(api.method.toLowerCase())}
          })
      }
    `;
    }
    else {
        _newApiFunc = `
      function ${api.name}(${_params}) {
          let _form = new FormData()
          Object.keys(req_body_form).forEach((key)=>{
            _form.set(key, req_body_form[key])
          })
          req_body_form = _form
          return api({
            method: '${api.method.toLowerCase()}',
            url: \`\$\{host\}${parseUrl(api.query_path, api.req.req_params.map)}\`,
            ${api.req.req_headers.value !== 'emty' ? headers + ',' : ''}
            ${reqOption(api.method.toLowerCase())}
          })
      }
    `;
    }
    return _newApiFunc;
}
function creatApiFuncDts(api) {
    let ifReqDescription = (params, type) => {
        if (params.value !== 'emty') {
            return `
        ${type}: {
          ${params.paramsType}
        },
      `;
        }
        else {
            return '';
        }
    };
    // ${
    //   ifReqDescription(api.req.req_headers, "req_headers")
    // }
    let _apiFuncDts = `
    
    export function ${api.name}(req:{
      ${ifReqDescription(api.req.req_params, "req_params")}
      ${ifReqDescription(api.req.req_query, "req_query")}
      ${ifReqDescription(api.req.req_body_form, "req_body_form")}
      ${ifReqDescription(api.req.req_body_other, "req_body_other")}
    }):${parseResBody(api.res_body)}
    
  `;
    return _apiFuncDts;
}
function creatFile(fileName, fileType, content) {
    let _fileType = {
        'js': 'js',
        'dts': 'd.ts'
    };
    // 创建文件
    fs.writeFile((`${config.file.outurl || './api'}/${fileName}.${_fileType[fileType]}`), content, function (err) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("写入成功");
        }
    });
}
/**
 * 解析请求参数
 * @param params 参数
 */
function parseParams(params, type) {
    let _paramsType = '';
    let _desc = '';
    let _value = params.length === 0 ? 'emty' : '';
    let _map = {};
    params.forEach((item) => {
        _value += `${item.name},\n`;
        _map[`${item.name}`] = item;
        _paramsType += `${item.name}:string,`,
            _desc += `* @param ${type}.${item.name} ${item.desc}\n`;
    });
    let _obj = {
        value: _value,
        map: _map,
        paramsType: _paramsType,
        desc: _desc
    };
    return _obj;
}
/**
 * 解析请求头
 * @param params
 */
function parseHeaders(params) {
    let _paramsType = '';
    let _desc = '';
    let _value = params.length === 0 ? 'emty' : '';
    let _name = '';
    let _map = [];
    params.forEach((item) => {
        _map.push({
            name: item.name,
            value: item.value
        });
        _paramsType += item.required === '1' ? `"${item.name}":string,` : `"${item.name}"?:string,`;
        _desc += `* @param headers.${item.name} defaultValue: ${item.value}\n`;
    });
    let _obj = {
        value: _value,
        map: _map,
        paramsType: _paramsType,
        desc: _desc
    };
    return _obj;
}
/**
 * 解析表单数据
 * @param params
 */
function parseBodyForm(params) {
    let _paramsType = '';
    let _desc = '';
    let _value = params.length === 0 ? 'emty' : '';
    let _map = {};
    let switchType = (type) => {
        if (type === 'text') {
            return 'string';
        }
        else {
            return 'File | FileList';
        }
    };
    params.forEach((item) => {
        _value += `${item.name},\n`; //参数名称合集（字符串）
        _map[`${item.name}`] = item; //  参数类型合集
        _paramsType += item.required === '1' // 参数类型合集(字符串)
            ? `${item.name}:${switchType(item.type)},`
            : `${item.name}?:${switchType(item.type)},`;
        _desc += `* @param headers.${item.name} ${item.desc}\n`; // 参数说明文本合集
    });
    let _obj = {
        value: _value,
        map: _map,
        paramsType: _paramsType,
        desc: _desc
    };
    return _obj;
}
function parseBodyOther(params) {
    let _json = params
        ? JSON.parse(params)
        : undefined;
    let _paramsType = '';
    let _desc = '';
    let _value = _json ? 'emty' : '';
    let _name = '';
    let _map = {};
    let switchType = (item) => {
        switch (item.type) {
            // TODO: 构建嵌套类型，来适应 test:{asd:123} 和 test:API[]
            case 'object':
                return item.properties ? `{ ${(() => {
                    let _key = '';
                    Object.keys(item.properties).forEach((key) => {
                        _key += `${key}:${switchType(item.properties[key])} \n`;
                    });
                    return _key;
                })()} }` : `any`;
            case 'array':
                return item.items ? `${switchType(item.items)}[]` : `any[]`;
            case 'integer':
                return 'number';
            default:
                return item.type;
        }
    };
    if (_json && _json['properties']) {
        let _properties = _json['properties'];
        Object.keys(_properties).forEach((key) => {
            _value += `${key},\n`; //参数名称合集（字符串）
            _map[`${key}`] = {
                required: "0",
                name: key,
                type: _properties[key].type,
                example: _properties[key].default,
                desc: _properties[key].description
            };
            //  参数类型合集
            _paramsType += _map[`${key}`].required === '1' // 参数类型合集(字符串)
                ? `${key}:${switchType(_properties[key])},`
                : `${key}?:${switchType(_properties[key])},`;
            _desc += `* @param headers.${key} ${_properties[key].description}\n`; // 参数说明文本合集
        });
    }
    let _obj = {
        value: _value,
        map: _map,
        paramsType: _paramsType,
        desc: _desc
    };
    return _obj;
}
function parseResBody(body) {
    switch (body.type) {
        case 'object':
            return `ApiPromise<{ ${parseResBodyItem(body)} }>`;
            break;
        case 'array':
            return `ApiPromise<${parseResBodyItem(body)}[]>`;
            break;
        default:
            return `ApiPromise< ${parseResBodyItem(body)} >`;
            break;
    }
}
/**
 * 解析返回数据合集
 * @param body
 */
function parseResBodyItem(body) {
    let output = '';
    switch (body.type) {
        case "object":
            Object.keys(body.properties).forEach((key) => {
                let _itemType = body.properties[key].type;
                switch (_itemType) {
                    case 'object':
                        output += `${key}: { ${parseResBodyItem(body.properties[key])} } \n`;
                        // output += `${key}:debug\n`
                        break;
                    case 'array':
                        output += `${key}:${parseResBodyItem(body.properties[key])}[]\n`;
                        // output += `${key}:debug\n`
                        break;
                    case 'integer':
                        output += `${key}:number\n`;
                        break;
                    default:
                        output += `${key}:${_itemType}\n`;
                        break;
                }
            });
            break;
        case "array":
            let _body = body;
            // console.log('-----------------');
            // console.log('_body :>> ', _body);
            switch (_body.items.type) {
                case 'object':
                    output += `{ ${parseResBodyItem(_body.items)} }`;
                    break;
                case 'array':
                    output += `${parseResBodyItem(_body.items)}[]`;
                    break;
                case 'integer':
                    output += `number`;
                    break;
                default:
                    output += `${_body.items.type}`;
                    break;
            }
            break;
    }
    // console.log('parseResBodyItem', output);
    return output;
}
