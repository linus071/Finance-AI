import excel function

export interface RawTransactionRow {
    "Account Type": string;
    "Account Number": string;
    "Transaction Date": string;
    "Cheque Number"?: string | number;
    "Description 1": string;
    "Description 2": string;
    "CAD$": string | number;
    "USD$"?: string | number;
  }

upload_file(.csv){
    parse files
    filter the header
    Account Type	Account Number	Transaction Date	Cheque Number	Description 1	Description 2	CAD$	USD$
    is by ascending from left to right A to H of these order
    if anthing in cell is empty just ignore 
    each row add to raw_data_map
}