sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/base/util/uid",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], (Controller, Fragment, uid, MessageBox, MessageToast) => {
  "use strict";

  return Controller.extend("com.ai.ragui.controller.BaseController", {
    onInit() {
    },

    _getServicePath: function () {
      let appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
      let appPath = appId.replaceAll(".", "/");
      let appModulePath = sap.ui.require.toUrl((appPath)?.replaceAll(".", "/"));
      return appModulePath;
    },
    _getRagResponse: async function (convId) {
      this.scrollChat();
      const oInput = this.byId("userInput");
      const prompt = oInput.getValue().trim();
      if (!prompt) return;

      const oChatModel = this.getView().getModel("oChatModel");
      const list = oChatModel.getProperty("/list") || [];

      if (!oChatModel.getProperty("/started")) oChatModel.setProperty("/started", true);

      list.push({ type: "query", text: prompt, busy: false });
      list.push({ type: "response", text: "", busy: true });
      oChatModel.setProperty("/list", list);

      const oServiceModel = this.getView().getModel();
      const oAction = oServiceModel.bindContext("/getChatRagResponse(...)");

      ["conversationId", "messageId", "message_time", "user_id", "user_query"]
        .forEach((k, i) => oAction.setParameter(k, [convId, "", new Date().toISOString(), "user_id-24045578", prompt][i]));

      try {
        await oAction.execute();
        const res = oAction.getBoundContext().getObject();
        list[list.length - 1] = { type: "response", text: res?.content || "No response", busy: false };
      } catch {
        list[list.length - 1] = { type: "response", text: "Something went wrong.", busy: false };
      }

      oChatModel.setProperty("/list", list);
      oInput.setValue("");
      this.scrollChat();
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