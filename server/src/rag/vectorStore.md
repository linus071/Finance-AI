//Pseudocode

vector_record:
{
    id:
    vector:[]
    metadata:{
        context:
        account_type:
        account_number:
        description 1:
        description 2:
        amount:
        date:
    }
}

//each vectord_record represent a row of data store in the whole vector_storage
vector_storage[] = vector_record [] = []

Ingestion Phase:
add_vector_record()
//Make  sure that stick with one embedding model, check if there is a difference
if (this.storage.length > 0 && incomingVector.length !== this.storage[0].vector.length) {
  console.warn("⚠️ Embedding provider changed! Flushing in-memory vector cache to prevent dimension mismatch.");
  this.clear(); // Wipes out the old incompatible dimensions safely
}

Query Phase:
similaritySearch(userinput, vector_record)
//consine similarity comparison from user input and vector_record
A[] = userinput.embed
B[] = vector_record
cosine_sim_arr = []

//Loop everysingle row of data to compare with user input
For each vector_record in vector_storage:

    dot product = 0
    magnitude A = 0
    magnitude B = 0

    For i FROM 0 to vector length:
        dot product += A[i] * B[i]
        magnitude A += (A[i])^2
        magnitude B += (B[i])^2
    cosine simialrity = dot product / sqrt(magnitude A) * sqrt(magnitude B)

    cosine_sim_arr += cosine similarity


//return top 5 most similar

//clear vector record
clear()
//return total number of items inside storage array
get_size()
