import { createContext, useContext } from 'react';

interface CreateReportContextType {
  openCreateReport: () => void;
}

export const CreateReportContext = createContext<CreateReportContextType | undefined>(undefined);

export const useCreateReport = () => {
  const context = useContext(CreateReportContext);
  return context;
};
