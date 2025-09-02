using {com.ai as db} from '../db/schema';

// @(requires: 'authenticated-user')
service EmbeddingStorageService {

    type ConfluencePage {
        idAsString            : String;
        creatorAccountId      : String;
        spaceKey              : String;
        spaceId               : Integer;
        modificationDate      : Integer;
        lastModifierAccountId : String;
        self                  : String;
        id                    : String;
        title                 : String;
        creationDate          : Integer;
        contentType           : String;
        version               : Integer;
    }

    entity DocumentChunk as
        projection on db.DocumentChunk
        excluding {
            embedding
        };

    action   pageCreated(page: ConfluencePage, userAccountId: String, timestamp: Integer, accountType: String)                                                        returns {
        message : String
    };

    action   pageUpdated(page: ConfluencePage, userAccountId: String, timestamp: Integer, accountType: String, updateTrigger: String, suppressNotifications: Boolean) returns {
        message : String
    };

    action   pageTrashed(page: ConfluencePage, userAccountId: String, timestamp: Integer, accountType: String)                                                        returns {
        message : String
    };

    entity ScrapedData   as projection on db.ScrapedData;
    entity SyncTable     as projection on db.SyncTable;
    entity DocumentFiles as projection on db.DocumentFiles;
    function scrapeWebsite(webUrl: String)                               returns String;
    action   getTextFromImage(image: LargeString)                        returns String;
    function storeEmbeddings(documentID: String)           returns String;
    function deleteEmbeddings()                                          returns String;
    function deleteFiles()                                               returns String;
    function   storeAllConfluenceEmbeddings(spaceKey: String)              returns String;
}
