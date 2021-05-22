var fs = require('fs');
var http = require('http');
var config = require('./apiconfig.json');
var apiList = [];
getYApiList();
function getYApiList() {
    var url = config.yapiConfig.url;
    http.get(url, function (res) {
        var _ctx = '';
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
        jsonApiList.forEach(function (api) {
            api.list.forEach(function (item) {
                var apiname = '';
                var _title = config.yapiConfig.categoryMap[item.title];
                var _flag = new RegExp(/([A-Z]|[a-z])/);
                if (_title || _flag.test(item.title)) {
                    var jsonApi = item;
                    apiname = _flag.test(item.title) ? item.title : _title;
                    if (jsonApi.res_body) {
                        var model = JSON.parse(jsonApi.res_body);
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
                                req_body_form: parseBodyForm(item.req_body_form)
                            },
                            res_body: model
                        });
                    }
                }
                else {
                    console.log("\u63A5\u53E3\"" + item.title + "\"\u7F3A\u5C11\u82F1\u6587\u540D\u79F0, path:" + item.path + ", query_method:" + item.method);
                }
            });
        });
        creatApiListJS(apiList);
        creatApiListDts(apiList);
    }
}
function creatApiListJS(apiList) {
    var _apiListText = '';
    var _apiFuncList = '';
    apiList.forEach(function (api) {
        _apiListText += creatApi(api);
        _apiFuncList += "\t" + api.name + ",\n";
    });
    var output = "\n    import api from \"" + config.axios.packageUrl + "\";\n    const host = `${ (process.env.isMock ? process.env.mockUrl : \n                            process.env.isProxy && !process.server ? process.env.proxyPath :\n                              process.env.backServerUrl\n      )}`\n    " + _apiListText + "\n\n    \rexport {\n      \n" + _apiFuncList + "\n    \r}\n  ";
    console.log("creatApiListJS");
    // console.log(output);
    creatFile(config.file.name || "API_test", 'js', output);
    // return output
}
function creatApiListDts(apiList) {
    var _apiListText = "\n    // import { AxiosPromise } from \"Axios\";\n\n    type ApiPromise<T> = Promise<T>\n  ";
    var _apiFuncList = '';
    apiList.forEach(function (api) {
        _apiListText += creatApiFuncDts(api);
    });
    var output = "\n    " + _apiListText + "\n  ";
    console.log("creatApiListDts");
    creatFile(config.file.name || "APi_test", 'dts', output);
}
function creatApi(api) {
    // ${api.req.req_headers.value !== 'emty' ? 'req_headers,' : ''}
    var _params = "{\n    " + (api.req.req_query.value !== 'emty' ? 'req_query,' : '') + "\n    \n    " + (api.req.req_body_form.value !== 'emty' ? 'req_body_form,' : '') + "\n    " + (api.req.req_params.value !== 'emty' ? 'req_params,' : '') + "\n  }";
    var reqOption = function (method) {
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            return "\n        params: " + (api.req.req_query.value !== 'emty' ? 'req_query,' : '{},') + "\n      ";
        }
        else {
            return "\n        params: " + (api.req.req_query.value !== 'emty' ? 'req_query,' : '{},') + "\n        data: " + (api.req.req_body_form.value !== 'emty' ? 'req_body_form,' : '{}') + "\n      ";
        }
    };
    var parseUrl = function (url, paramsMap) {
        var _newUrl = url;
        var _target = _newUrl.match(/:([A-Z]|[a-z])+\//g);
        Object.keys(paramsMap).forEach(function (tag) {
            _target.forEach(function (params) {
                _newUrl = _newUrl.replace(params, "${req_params." + tag + "}/");
            });
        });
        return _newUrl;
    };
    var isFormData = false;
    var _headers = '';
    api.req.req_headers.map.forEach(function (item, index) {
        if (index === api.req.req_headers.map.length - 1) {
            _headers += "\"" + item.name + "\":\"" + item.value + "\"";
        }
        else {
            _headers += "\"" + item.name + "\":\"" + item.value + "\",";
        }
        if (item.value.indexOf('x-www-form-urlencoded') > -1) {
            isFormData = true;
        }
    });
    var headers = "headers: {" + _headers + "}";
    var _newApiFunc = '';
    if (!isFormData) {
        _newApiFunc = "\n      function " + api.name + "(" + _params + ") {\n          \n          return api({\n            method: '" + api.method.toLowerCase() + "',\n            url: `${host}" + parseUrl(api.query_path, api.req.req_params.map) + "`,\n            " + (api.req.req_headers.value !== 'emty' ? headers + ',' : '') + "\n            " + reqOption(api.method.toLowerCase()) + "\n          })\n      }\n    ";
    }
    else {
        _newApiFunc = "\n      function " + api.name + "(" + _params + ") {\n          let _form = new FormData()\n          Object.keys(req_body_form).forEach((key)=>{\n            _form.set(key, req_body_form[key])\n          })\n          req_body_form = _form\n          return api({\n            method: '" + api.method.toLowerCase() + "',\n            url: `${host}" + parseUrl(api.query_path, api.req.req_params.map) + "`,\n            " + (api.req.req_headers.value !== 'emty' ? headers + ',' : '') + "\n            " + reqOption(api.method.toLowerCase()) + "\n          })\n      }\n    ";
    }
    return _newApiFunc;
}
function creatApiFuncDts(api) {
    var ifReqDescription = function (params, type) {
        if (params.value !== 'emty') {
            return "\n        " + type + ": {\n          " + params.paramsType + "\n        },\n      ";
        }
        else {
            return '';
        }
    };
    // ${
    //   ifReqDescription(api.req.req_headers, "req_headers")
    // }
    var _apiFuncDts = "\n    \n    export function " + api.name + "(req:{\n      " + ifReqDescription(api.req.req_params, "req_params") + "\n      " + ifReqDescription(api.req.req_query, "req_query") + "\n      " + ifReqDescription(api.req.req_body_form, "req_body_form") + "\n    }):" + parseResBody(api.res_body) + "\n    \n  ";
    return _apiFuncDts;
}
function creatFile(fileName, fileType, content) {
    var _fileType = {
        'js': 'js',
        'dts': 'd.ts'
    };
    // 创建文件
    fs.writeFile(((config.file.outurl || './api') + "/" + fileName + "." + _fileType[fileType]), content, function (err) {
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
    var _paramsType = '';
    var _desc = '';
    var _value = params.length === 0 ? 'emty' : '';
    var _map = {};
    params.forEach(function (item) {
        _value += item.name + ",\n";
        _map["" + item.name] = item;
        _paramsType += item.name + ":string,",
            _desc += "* @param " + type + "." + item.name + " " + item.desc + "\n";
    });
    var _obj = {
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
    var _paramsType = '';
    var _desc = '';
    var _value = params.length === 0 ? 'emty' : '';
    var _name = '';
    var _map = [];
    params.forEach(function (item) {
        _map.push({
            name: item.name,
            value: item.value
        });
        _paramsType += item.required === '1' ? "\"" + item.name + "\":string," : "\"" + item.name + "\"?:string,";
        _desc += "* @param headers." + item.name + " defaultValue: " + item.value + "\n";
    });
    var _obj = {
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
    var _paramsType = '';
    var _desc = '';
    var _value = params.length === 0 ? 'emty' : '';
    var _map = {};
    var switchType = function (type) {
        if (type === 'text') {
            return 'string';
        }
        else {
            return 'File | FileList';
        }
    };
    params.forEach(function (item) {
        _value += item.name + ",\n";
        _map["" + item.name] = item;
        _paramsType += item.required === '1' ? item.name + ":" + switchType(item.type) + "," : item.name + "?:" + switchType(item.type) + ",";
        _desc += "* @param headers." + item.name + " " + item.desc + "\n";
    });
    var _obj = {
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
            return "ApiPromise<{ " + parseResBodyItem(body) + " }>";
            break;
        case 'array':
            return "ApiPromise<" + parseResBodyItem(body) + "[]>";
            break;
        default:
            return "ApiPromise< " + parseResBodyItem(body) + " >";
            break;
    }
}
/**
 * 解析返回数据合集
 * @param body
 */
function parseResBodyItem(body) {
    var output = '';
    switch (body.type) {
        case "object":
            Object.keys(body.properties).forEach(function (key) {
                var _itemType = body.properties[key].type;
                switch (_itemType) {
                    case 'object':
                        output += key + ": { " + parseResBodyItem(body.properties[key]) + " } \n";
                        // output += `${key}:debug\n`
                        break;
                    case 'array':
                        output += key + ":" + parseResBodyItem(body.properties[key]) + "[]\n";
                        // output += `${key}:debug\n`
                        break;
                    case 'integer':
                        output += key + ":number\n";
                        break;
                    default:
                        output += key + ":" + _itemType + "\n";
                        break;
                }
            });
            break;
        case "array":
            var _body = body;
            // console.log('-----------------');
            // console.log('_body :>> ', _body);
            switch (_body.items.type) {
                case 'object':
                    output += "{ " + parseResBodyItem(_body.items) + " }";
                    break;
                case 'array':
                    output += parseResBodyItem(_body.items) + "[]";
                    break;
                case 'integer':
                    output += "number";
                    break;
                default:
                    output += "" + _body.items.type;
                    break;
            }
            break;
    }
    // console.log('parseResBodyItem', output);
    return output;
}
