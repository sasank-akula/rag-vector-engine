sap.ui.define([
    "com/ai/ragui/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/base/util/uid",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, JSONModel, uid, MessageToast, MessageBox, Filter, FilterOperator) => {
    "use strict";

    return BaseController.extend("com.ai.ragui.controller.Main", {
        onInit: function () {
            this._oDSC = this.byId("DynamicSideContent");
            this._showSideContentButton = this.byId("showSideContentButton");
            this.flag = 0;
        },
        _getLoggedInUserDetails: function () {
            let sServiceUrl = this._getServicePath() + "/user-api/currentUser";
            let that = this;
            $.ajax({
                url: sServiceUrl,
                type: "GET",
                dataType: "json",
                async: true,
                success: function (data) {
                    let userModel = new JSONModel(data);
                    that.getView().setModel(userModel, "UserData");
                },
                error: function () {
                    MessageToast.show("Fething User Details failed");
                }
            });

        },
        onAfterRendering: function () {
            this._getLoggedInUserDetails();
        },
        onSendMessage: async function () {

            if (this.flag === 0) {
                this.convId = uid();
                this.flag = 1;
            }
           await this._getRagResponse(this.convId);
        },
        onReloadChat: function () {
            this.convId = uid();
            const oModel = this.getView().getModel("oChatModel");
            oModel.setProperty("/list", []);
        }
    });
});