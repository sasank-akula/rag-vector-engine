sap.ui.define([
    "com/ai/ragadminui/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/base/util/uid",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, JSONModel, uid, MessageToast, MessageBox, Filter, FilterOperator) => {
    "use strict";

    return BaseController.extend("com.ai.ragadminui.controller.Main", {
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
                    that.handleSideContentHide(userModel.getData())
                },
                error: function () {
                    MessageToast.show("Fething User Details failed");
                }
            });

        },


        onAfterRendering: function () {
            this._getLoggedInUserDetails();
            let sCurrentBreakpoint = this._oDSC.getCurrentBreakpoint();
            this.updateToggleButtonState(sCurrentBreakpoint);
        },

        handleSliderChange: function (oEvent) {
            let iValue = oEvent.getParameter("value");
            this.updateControlWidth(iValue);
        },

        updateControlWidth: function (iValue) {
            let $DSCContainer = this.byId("sideContentContainer").$();
            if (iValue) {
                $DSCContainer.width(iValue + "%");
            }
        },

        handleBreakpointChangeEvent: function (oEvent) {
            let sCurrentBreakpoint = oEvent.getParameter("currentBreakpoint");
            this.updateToggleButtonState(sCurrentBreakpoint);
            this.updateShowSideContentButtonVisibility(sCurrentBreakpoint);
        },

        updateToggleButtonState: function (sCurrentBreakpoint) {
            let oToggleButton = this.byId("toggleButton");
            oToggleButton.setEnabled(sCurrentBreakpoint === "S");
        },

        updateShowSideContentButtonVisibility: function (sCurrentBreakpoint) {
            let bShowButton = !(sCurrentBreakpoint === "S" || this._oDSC.isSideContentVisible());
            this._showSideContentButton.setVisible(bShowButton);
        },

        handleToggleClick: function () {
            this._oDSC.toggle();
        },

        handleSideContentHide: function (data) {
            let scopes = data.scopes || [];
            console.log(scopes);

            // Check if any scope ends with ".BotAdmin"
            let res = scopes.inludes("rag-vector-engine-9d5a94ectrial-dev!t485944.ChatBotAdmin");
            console.log(res);
            // Store as a boolean
            this.getView().getModel("UserData").setProperty("/showSideContent", res);
        },
        handleSideContentShow: function () {
            this._oDSC.setShowSideContent(true);
            this.updateShowSideContentButtonVisibility(this._oDSC.getCurrentBreakpoint());
        },

        onSendMessage: async function () {

            if (this.flag === 0) {
                this.convId = uid();
                this.flag = 1;
            }
            // Call the function to get the response from the RAG (Retrieval-Augmented Generation) service using the conversation ID
            await this._getRagResponse(this.convId);

        },

        onReloadChat: function () {
            this.convId = uid();
            const oModel = this.getView().getModel("oChatModel");
            oModel.setProperty("/list", []);
        },
        onFileSizeExceed: function (oEvent) {
            MessageBox.warning("File size exceeds the 5 MB limit.");
        },


        onChange: function (oEvent) {
            debugger

            const aFiles = oEvent.getParameter("files");
            this.onAfterItemAdded(aFiles[0]);
        },

        onAfterItemAdded: async function (file) {
            debugger
            const reader = new FileReader();

            reader.onload = async (e) => {
                const base64Content = e.target.result.split(",")[1];

                const item = {
                    getMediaType: () => file.type,
                    getFileName: () => file.name,
                    getFileObject: () => file,
                    base64Content: base64Content
                };

                this._showBusy(true);
                try {
                    await this.createEntity(item);
                    MessageToast.show(`File is Uploading.....`);
                    this.byId("idList").getBinding("items").refresh();
                } catch (err) {
                    console.error("Upload failed:", err);
                    MessageToast.show("Upload failed");
                } finally {
                    this._showBusy(false);
                }
            };

            reader.onerror = (err) => {
                console.error("File reading error:", err);
                MessageToast.show("File read error");
            };
            reader.readAsDataURL(file);
        },



        onUploadCompleted: function () {
            const oUploadCollection = this.byId("UploadCollection");
            oUploadCollection.getBinding("items").refresh();
        },
        typeMissmatch: function (oEvent) {
            MessageBox.warning("Invalid file type. Only PDFs are allowed.");
        },


        createEntity: async function (item) {
            const data = {
                ID: self.crypto.randomUUID(),
                mediaType: item.getMediaType(),
                fileName: item.getFileName(),
                size: item.getFileObject().size.toString(),
                content: item.base64Content
            };
            this.ODataPost("/DocumentFiles", data);
            this.byId("idList").getBinding("items").refresh();

        },

        _getEmbeddingResponse: async function (ID) {
            const url = sessionStorage.getItem("isDeployedVersion") === "true"
                ? this._getServicePath() + "/odata/v4/embedding-storage/storeEmbeddings"
                : "/odata/v4/embedding-storage/storeEmbeddings";

            return new Promise((resolve, reject) => {
                $.ajax({
                    url: url + "(documentID='" + ID + "')",
                    method: "GET"
                })
                    .done((result) => {
                        MessageToast.show("you can ask now..")
                    })
                    .fail((err) => {
                        reject(err);
                    });
            });
        },

        onFileDeleted: async function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const sItemToDeleteId = oItem.getBindingContext().getProperty("ID");

            this._showBusy(true);
            try {
                await this.deleteItemById(sItemToDeleteId);
                MessageToast.show("File deleted successfully.");
                this.byId("idList").getBinding("items").refresh();
            } catch (err) {
                MessageToast.show("Error deleting file.");
                console.error(err);
            } finally {
                this._showBusy(false);
            }
        },

        deleteItemById: function (sItemToDeleteId) {
            const oModel = this.getView().getModel();
            const oBindList = oModel.bindList("/DocumentFiles");
            const aFilter = new Filter("ID", FilterOperator.EQ, sItemToDeleteId);

            return oBindList.filter(aFilter).requestContexts().then(function (aContexts) {
                if (aContexts.length > 0) {
                    return aContexts[0].delete();
                } else {
                    return Promise.reject("No matching item found");
                }
            });
        },

        _showBusy: function (bBusy) {
            const oView = this.getView();
            oView.setBusyIndicatorDelay(0);
            oView.setBusy(bBusy);
        },

        onDeleteDocumentPress: async function (oEvent) {
            await this.deleteItemById(oEvent.getParameter("documentId"));
            MessageToast.show("FileDeleted event triggered.");
        },

        onSearchDocuments: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            const oUploadCollection = this.byId("idList");
            const oBinding = oUploadCollection.getBinding("items");

            if (sQuery && sQuery.length > 0) {
                const oFilter = new Filter("fileName", FilterOperator.Contains, sQuery);
                oBinding.filter([oFilter]);
            } else {
                oBinding.filter([]);
            }
        },
        updateFileCount: function (oEvent) {
            let iTotalItems = oEvent.getParameter("total");
            let oPage = this.byId("documentCount");
            if (iTotalItems && oPage) {
                oPage.setText("Documents (" + iTotalItems + ")");
            }

        }
    });
});