using {com.ai as db} from '../db/schema';
@(requires: 'authenticated-user')
service EmbeddingStorageService {
    
    entity DocumentChunk as
        projection on db.DocumentChunk
        excluding {
            embedding
        };
    entity DocumentFiles as projection on db.DocumentFiles; 

    function storeEmbeddings(documentID : String)  returns String;
    function deleteEmbeddings() returns String;
    function deleteFiles() returns String;
}