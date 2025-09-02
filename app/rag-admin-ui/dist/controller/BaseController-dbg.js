sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/base/util/uid",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], (Controller, Fragment, uid, MessageBox, MessageToast) => {
  "use strict";

  return Controller.extend("com.ai.ragadminui.controller.BaseController", {
    onInit() {
    },

    _getServicePath: function () {
      let appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
      let appPath = appId.replaceAll(".", "/");
      let appModulePath = sap.ui.require.toUrl((appPath)?.replaceAll(".", "/"));
      return appModulePath;
    },


    _getRagResponse: async function (convId) {

      let oInput = this.byId("userInput");
      let prompt = oInput.getValue().trim();
      if (!prompt) return;

      let oModel = this.getView().getModel("oChatModel");
      let aChatList = oModel.getProperty("/list") || [];


      if (!oModel.getProperty("/started")) {
        oModel.setProperty("/started", true);
      }


      aChatList.push({
        type: "query",
        text: prompt,
        busy: false
      });

      aChatList.push({
        type: "response",
        text: "",
        busy: true
      });

      oModel.setProperty("/list", aChatList);
      let that = this;
      let timeStamp = new Date().toISOString();


      let payload = {
        "conversationId": convId,
        "messageId": "",
        "message_time": timeStamp,
        "user_id": "user_id-24045578",
        "user_query": prompt
      }

      $.ajax({
        url: "/odata/v4/roadshow/getChatRagResponse",
        // url: this._getServicePath() + "/odata/v4/roadshow/getChatRagResponse",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(payload),
        success: function (oData) {
          let list = oModel.getProperty("/list") || [];
          if (list.length > 0 && list[list.length - 1].busy) {
            list[list.length - 1] = {
              type: "response",
              text: oData.content,
              busy: false
            };
            oModel.setProperty("/list", list);
          }
          that.scrollChat()
        },
        error: function () {
          let list = oModel.getProperty("/list") || [];
          if (list.length > 0 && list[list.length - 1].busy) {
            list[list.length - 1] = {
              type: "response",
              text: "Something went wrong.",
              busy: false
            };
            oModel.setProperty("/list", list);
          }
          that.scrollChat();
        }
      });

      oInput.setValue("");
      that.scrollChat();

    },

    onQuickAction: function (oEvent) {
      let sText = oEvent.getSource().getText();
      this.byId("jouleInput").setValue(sText);
      this.onSend();
    },

    openFragment: function (sPath) {
      let oView = this.getView();
      return Fragment.load({
        id: oView.getId(),
        name: sPath,
        controller: this
      }).then(function (oDialog) {
        oView.addDependent(oDialog);
        return oDialog;
      });
    },
    ODataPost: function (sPath, oNewData) {
    let oModel = this.getView().getModel();
    let oListBinding = oModel.bindList(sPath);
    
    // Create entity and get its context
    let oContext = oListBinding.create(oNewData);

    // Handle success
    oContext.created()
        .then(() => {
            MessageToast.show("File Uploaded successfully!");
            
        })
        .catch((oError) => {
            MessageBox.error("Error creating data: " + oError.message);
            console.error("Creation error:", oError);
        });
},


    scrollChat: function () {
      setTimeout(() => {
        let oScroll = this.byId("chatScroll");
        if (oScroll) {
          oScroll.scrollTo(0, 1e6, 200);
        }
      }, 150);
    }

  });
});