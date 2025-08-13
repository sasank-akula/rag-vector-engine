using { com.ai as db } from '../db/schema';
@(requires: 'authenticated-user')
service RoadshowService {
     entity Conversation  as projection on db.Conversation;
    entity Message      as projection on db.Message;

    function getRagResponse(question : String) returns String;

     type RagResponse_AdditionalContents {

        score       : String;
        pageContent : String;
    }

    type RagResponse {
        role               : String;
        content            : String;
        messageTime        : String;
        additionalContents : array of RagResponse_AdditionalContents;
    }

  action   getChatRagResponse(conversationId : String, messageId : String, message_time : String, user_id : String, user_query : String) returns RagResponse;
function deleteChatData() returns String;
    // function executeSimilaritySearch() returns String;
    

}