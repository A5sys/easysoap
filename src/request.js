(() => {
    'use strict';

    const _ = require('underscore');

    const assert = require('assert');
    const request = require('request');
    const wsdlrdr = require('wsdlrdr');

    module.exports = SoapRequest;

    function getProtocol (opts = {}) {
        if (opts.secure === void 0) {
            opts.secure = false;
        }

        return (opts.secure) ? 'https://' : 'http://';
    }

    function asyncRequest (params = {}) {
        return new Promise((resolve, reject) => {
            request(params, function (error, response, body) {
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        'body'    : body,
                        'response': response
                    });
                }
            });
        });
    }

    function baseParamsToRequestParams (baseParams) {
        var requestParams = Object.assign({}, baseParams);
        if (requestParams.headers) {
            if (_.isArray(requestParams.headers)) {
                requestParams.headers = _.reduce(requestParams.headers, (store, headerItem) => {
                    store[headerItem.name] = headerItem.value;
                    return store;
                }, {});
            }
        }

        return requestParams;
    }

    function getTagAttributes (attributes = {}) {
        const attributeKeys = Object.keys(attributes);
        if (attributeKeys.length === 0) {
            return '';
        }

        return ' ' + attributeKeys
            .map((key) => `${key}="${attributes[key]}"`)
            .join(' ');
    };

    function getParamAsString (key, value, paramData = {}, attributes = {}) {
        // array value given, then create item for every value
        if (Array.isArray(value)) {
            return value
                .map((valueItem) => getParamAsString(key, valueItem, paramData, attributes))
                .join('');
        }

        // handle objects
        if (Object(value) === value) {
            if (value._value ||
                value._attributes) {
                attributes = Object.assign({}, attributes, value._attributes || {});
                value = value._value || '';
            } else {
                value = Object.keys(value)
                    .map((valueKey) => getParamAsString(valueKey, value[valueKey], paramData, attributes))
                    .join('');
            }
        }

        // add namespace to tag
        let namespace = '';
        if (paramData) {
            if (paramData.namespace) {
                namespace = paramData.namespace + ':';
            }
        }

        // add attributes to tag
        let attributesString = '';
        if (attributes) {
            attributesString = getTagAttributes(attributes);
        }

        return `<${namespace}${key}${attributesString}>${value}</${namespace}${key}>`;
    }

    function getMethodParamRequestString (requestParams, paramKey, callParams) {
        // got request param attributes
        let methodRequestParams = {};
        for (const requestParamsAttributes of requestParams) {
            if (requestParamsAttributes.params) {
                methodRequestParams = requestParamsAttributes.params
                    .find((requestParamItem) =>
                        requestParamItem.name === paramKey ||
                        requestParamItem.element === paramKey);
            }
        }

        const paramValue = callParams.params[paramKey];
        const mergedAttributes = Object.assign({}, callParams.attributes, paramValue._attributes || {});

        return getParamAsString(
            paramKey,
            paramValue,
            methodRequestParams,
            mergedAttributes
        );
    }

    async function getRequestParamsAsString (callParams = {}, baseParams = {}, opts = {}) {
        assert.ok(callParams.method, 'no method given');

        // Dirty fix to make easysoap compatible with our packaging lib
        const methodParams = {
            request: [
                {
                    params: [],
                    name: 'parameters',
                    namespace: 'tns',
                    element: 'LivestockResultsDocumentAvailabilityNotice'
                }
            ],
            response: [
                {
                    params: [],
                    name: 'parameters',
                    namespace: 'tns',
                    element: 'LivestockResultsDocumentAvailabilityNoticeResponse'
                }
            ]
        };
        const requestParams = methodParams.request;

        const responseArray = [];
        for (const paramKey of Object.keys(callParams.params)) {
            responseArray.push(
                getMethodParamRequestString(requestParams, paramKey, callParams)
            );
        }

        return getParamAsString(callParams.method, responseArray.join(''), null, callParams.attributes);
    }

    function getRequestEnvelopeParams (params, opts) {
        // Dirty fix to make easysoap compatible with our packaging lib
        const namespaces = [
            { short: 'wsdl', full: 'http://schemas.xmlsoap.org/wsdl/' },
            { short: 'wsx', full: 'http://schemas.xmlsoap.org/ws/2004/09/mex' },
            {
                short: 'wsu',
                full: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd'
            },
            { short: 'wsa10', full: 'http://www.w3.org/2005/08/addressing' },
            {
                short: 'wsp',
                full: 'http://schemas.xmlsoap.org/ws/2004/09/policy'
            },
            {
                short: 'wsap',
                full: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/policy'
            },
            {
                short: 'msc',
                full: 'http://schemas.microsoft.com/ws/2005/12/wsdl/contract'
            },
            {
                short: 'soap12',
                full: 'http://schemas.xmlsoap.org/wsdl/soap12/'
            },
            {
                short: 'wsa',
                full: 'http://schemas.xmlsoap.org/ws/2004/08/addressing'
            },
            {
                short: 'wsam',
                full: 'http://www.w3.org/2007/05/addressing/metadata'
            },
            { short: 'xsd', full: 'http://www.w3.org/2001/XMLSchema' },
            { short: 'tns', full: 'http://tempuri.org/' },
            { short: 'soap', full: 'http://schemas.xmlsoap.org/wsdl/soap/' },
            {
                short: 'wsaw',
                full: 'http://www.w3.org/2006/05/addressing/wsdl'
            },
            {
                short: 'soapenc',
                full: 'http://schemas.xmlsoap.org/soap/encoding/'
            }
        ];

        // var soap = _.findWhere(namespaces, { 'short': 'soap' });
        var xsd = _.findWhere(namespaces, { 'short': 'xsd' }) || {};

        return {
            'soap_env'  : 'http://schemas.xmlsoap.org/soap/envelope/',
            'xml_schema': xsd.full || 'http://www.w3.org/2001/XMLSchema',
            'namespaces': namespaces
        };
    }

    function getRequestHeadParams (params = {}) {
        if (!params.headers) {
            return null;
        }

        if (!Array.isArray(params.headers) &&
            params.headers === Object(params.headers)) {
            params.headers = Object.keys(params.headers).map((key) => {
                return {
                    name : key,
                    value: params.headers[key]
                };
            });
        }

        return params.headers
            .map((item, index) => `<cns${index}:${item.name}>${item.value}</cns${index}:${item.name}>`);
    }

    function SoapRequest (params = {}, opts = {}) {
        if (!(this instanceof SoapRequest)) return new SoapRequest(params, opts);

        this._url = getProtocol(opts) + params.host + params.path;
        this._headers = {
            // Don't try this at home
            // Add SOAPAction here, because the classical method to add headers add them in the soap response wich
            // does not work with the current wsdl of the api
            'SOAPAction': 'http://tempuri.org/IExternalService/LivestockResultsDocumentAvailabilityNotice',
            'Content-Type': 'text/xml; charset=utf-8'
        };

        this._opts = opts;
        this._params = params;
    };

    SoapRequest.prototype.getRequestXml = async function (params = {}, defaultParams = {}, opts = {}) {
        const combinedParams = Object.assign({}, defaultParams, params);

        const head = await getRequestHeadParams(combinedParams);
        const envelope = await getRequestEnvelopeParams(combinedParams, opts);
        const body = await getRequestParamsAsString(params, defaultParams, opts);

        const $namespaces = envelope.namespaces.map((namespace) => `xmlns:${namespace.short}="${namespace.full}"`);
        const $namespacesAsString = $namespaces.join(' ');

        const $head = (head !== null) ? `<SOAP-ENV:Header>${head.join('')}</SOAP-ENV:Header>` : '';
        const $body = `<SOAP-ENV:Body>${body}</SOAP-ENV:Body>`;

        const $soapEnvelope = `<SOAP-ENV:Envelope
            xmlns:SOAP-ENV="${envelope.soap_env}"
            ${$namespacesAsString}>
            ${$head}
            ${$body}
        </SOAP-ENV:Envelope>`;

        return `<?xml version="1.0" encoding="UTF-8"?>${$soapEnvelope}`;
    };

    SoapRequest.prototype.call = async function (params = {}) {
        const self = this;

        // add custom headers
        if (params.headers) {
            if (Array.isArray(params.headers)) {
                params.headers.forEach((headerItem) => {
                    self._headers[headerItem.name] = headerItem.value;
                });
            } else {
                self._headers = params.headers;
            }
        }

        const requestXml = await self.getRequestXml(params, this._params, this._opts);
        const result = await asyncRequest({
            url               : this._url,
            body              : requestXml,
            headers           : this._headers,
            rejectUnauthorized: this._params.rejectUnauthorized,
            method            : 'POST'
        });

        return {
            'body'    : result.body,
            'response': result.response,
            'header'  : result.response.headers
        };
    };
})();
