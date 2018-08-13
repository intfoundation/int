'use strict';

const Base = require('../base/base.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

class ServiceDescriptor {
    constructor(id, flags = 0, info) {
        if (info) {
            this.m_serviceInfo = new Map(info);
        } else {
            this.m_serviceInfo = null;
        }
        this.m_id = id;
        this.m_flags = flags;
        this.m_subDescriptors = null;
    }

    findService(servicePath) {
        if (!servicePath || servicePath.length === 0) {
            return this;
        }

        let desc = this;
        for (let subID of servicePath) {
            if (!desc.m_subDescriptors) {
                return null;
            }

            desc = desc.m_subDescriptors.get(subID);
        }
        return desc;
    }

    // services = [{id, flags, services, info}]
    updateServices(services) {
        if (this.m_subDescriptors === services) {
            return;
        }

        let servicesArray = services;
        if (services instanceof Map) {
            servicesArray = MapToArray(services);
        }

        markSignOutServices(servicesArray);
        updateServicesWithSignOutMark(this, servicesArray);
        return;

        function MapToArray(servicesMap) {
            let servicesArray = [];
            servicesMap.forEach((srv, id) => {
                let srvObj = {
                    id,
                    flags: srv.flags,
                    info: srv.info,
                };

                if (srv.services) {
                    srvObj.services = MapToArray(srv.services);
                }
                servicesArray.push(srvObj);
            });
            return servicesArray;
        }

        function markSignOutServices(services) {
            if (!services || services.length === 0) {
                return;
            }

            for (let subSrv of services) {
                markSignOutServices(subSrv.services);
                if (subSrv.flags & ServiceDescriptor.FLAGS_SIGNIN_SERVER === 0) {
                    subSrv.isSignOut = true;
                    if (subSrv.services) {
                        for (let grandSrv of subSrv.services) {
                            if (!grandSrv.isSignOut) {
                                subSrv.isSignOut = false;
                                break;
                            }
                        }
                    }
                }
            }
        }

        function updateServicesWithSignOutMark(descriptor, services) {
            descriptor.m_subDescriptors = null;
            if (!services || services.length === 0) {
                return;
            }

            for (let subSrv of services) {
                if (subSrv.isSignOut) {
                    continue;
                }
                if (!descriptor.m_subDescriptors) {
                    descriptor.m_subDescriptors = new Map();
                }

                let subDescriptor = new ServiceDescriptor(subSrv.id, subSrv.flags, subSrv.info);
                descriptor.m_subDescriptors.set(subSrv.id, subDescriptor);
                updateServicesWithSignOutMark(subDescriptor, subSrv.services);
            }
        }
    }

    signinService(servicePath) {
        if (servicePath && servicePath.length > 0) {
            return _signinService(this, 0);
        } else {
            return null;
        }

        function _signinService(descriptor, cursor) {
            if (servicePath.length === cursor) {
                descriptor.m_flags |= ServiceDescriptor.FLAGS_SIGNIN_SERVER;
                return descriptor;
            }

            if (!descriptor.m_subDescriptors) {
                descriptor.m_subDescriptors = new Map();
            }

            let childID = servicePath[cursor];
            let childDesc = descriptor.m_subDescriptors.get(childID);
            if (!childDesc) {
                childDesc = new ServiceDescriptor(childID);
                descriptor.m_subDescriptors.set(childID, childDesc);
            }

            return _signinService(childDesc, cursor + 1);
        }
    }

    signoutService(servicePath) {
        if (servicePath && servicePath.length > 0 && this.m_subDescriptors) {
            let serviceID = servicePath[0];
            let signoutedService = _signoutService(this, 0);
            if (signoutedService && signoutedService.isAllServiceStopped()) {
                this.m_subDescriptors.delete(serviceID);
                if (this.m_subDescriptors.size === 0) {
                    this.m_subDescriptors = null;
                }
            }
        }
        return;

        function _signoutService(descriptor, cursor) {
            if (servicePath.length === cursor) {
                descriptor.m_flags &= ~ServiceDescriptor.FLAGS_SIGNIN_SERVER;
                descriptor.m_serviceInfo = null;
                return descriptor;
            }

            if (descriptor.m_subDescriptors) {
                let serviceID = servicePath[sursor];
                let service = descriptor.m_subDescriptors.get(serviceID);
                if (service) {
                    let serviceID = servicePath[cursor];
                    let signoutedService = _signoutService(service, cursor + 1);
                    if (signoutedService && signoutedService.isAllServiceStopped()) {
                        descriptor.m_subDescriptors.delete(serviceID);
                        if (descriptor.m_subDescriptors.size === 0) {
                            descriptor.m_subDescriptors = null;
                        }
                        if (descriptor.isSignOut()) {
                            return descriptor;
                        }
                    }
                }
            }
            return null;
        }
    }

    getServiceInfo(servicePath, key) {
        let descriptor = this.findService(servicePath);
        if (descriptor && descriptor.m_serviceInfo) {
            return descriptor.m_serviceInfo.get(key);
        }
        return null;
    }

    setServiceInfo(servicePath, newValue) {
        let descriptor = this.findService(servicePath);
        if (descriptor) {
            if (newValue) {
                if (descriptor.m_serviceInfo !== newValue) {
                    descriptor.m_serviceInfo = new Map(newValue);
                }
            } else {
                descriptor.m_serviceInfo = null;
            }
        }
    }

    updateServiceInfo(servicePath, key, value) {
        let descriptor = this.findService(servicePath);
        if (descriptor) {
            if (!descriptor.m_serviceInfo) {
                descriptor.m_serviceInfo = new Map();
            }
            descriptor.m_serviceInfo.set(key, value);
        }
    }

    deleteServiceInfo(servicePath, key) {
        let descriptor = this.findService(servicePath);
        if (descriptor && descriptor.m_serviceInfo) {
            descriptor.m_serviceInfo.delete(key);
            if (descriptor.m_serviceInfo.size === 0) {
                descriptor.m_serviceInfo = null;
            }
        }
    }

    isSigninServer() {
        return this.m_flags & ServiceDescriptor.FLAGS_SIGNIN_SERVER;
    }

    isAllServiceStopped() {
        if (this.isSigninServer()) {
            return false;
        }

        if (this.m_subDescriptors) {
            for (let [subID, service] of this.m_subDescriptors) {
                if (service.isSigninServer()) {
                    return false;
                }
            }
        }
        return true;
    }

    get id() {
        return this.m_id;
    }

    get flags() {
        return this.m_flags;
    }

    get services() {
        return this.m_subDescriptors;
    }

    get info() {
        return this.m_info;
    }

    toStructForPackage() {
        let obj = {};

        if (this.m_serviceInfo) {
            obj.info = [...this.m_serviceInfo];
        }

        if (this.m_flags) {
            obj.flags = this.m_flags;
        }

        if (this.m_subDescriptors) {
            obj.services = [];
            this.m_subDescriptors.forEach((desc, id) => {
                let subSvcObj = desc.toStructForPackage();
                subSvcObj.id = id;
                obj.services.push(subSvcObj);
            });
        }
        return obj;
    }
}
ServiceDescriptor.FLAGS_SIGNIN_SERVER = 0x1;

module.exports = ServiceDescriptor;